#!/usr/bin/env python3
"""FORJA — análise de treinos em Python (estudo e gráficos de desempenho).

Roda no SEU computador, offline, sobre um arquivo exportado pelo app:

  • Ajustes → Backup → Exportar (sem senha)            → backup real
  • Ajustes → Modo desenvolvedor → Exportar dados de teste → dados simulados

Uso:
  python3 scripts/analyze.py ARQUIVO.json
  python3 scripts/analyze.py ARQUIVO.json --out analise      # grava CSV/JSON/PNG em ./analise
  python3 scripts/analyze.py ARQUIVO.json --out analise --top 3 --no-charts

Só usa a biblioteca padrão. Os gráficos (PNG) exigem `matplotlib`
(pip install matplotlib); sem ele o script gera o relatório, os CSV e o JSON.
Nada é enviado para a internet e o app não executa Python: este é um utilitário
de estudo, separado do PWA (que continua sem dependências).

As fórmulas espelham o app: 1RM estimado de Epley com no máximo 15 repetições,
volume = carga × repetições, estagnação = 3 sessões sem superar em 1% a anterior.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

MAX_BYTES = 20 * 1024 * 1024
STAGNATION_WINDOW = 3

GROUPS = {
    "peito": "Peito", "costas": "Costas", "ombros": "Ombros", "biceps": "Bíceps",
    "triceps": "Tríceps", "quadriceps": "Quadríceps", "posterior": "Posterior de coxa",
    "gluteos": "Glúteos", "panturrilha": "Panturrilha", "abdomen": "Abdômen",
}

# Cores (tema escuro do app). As três séries categóricas foram validadas contra a
# superfície #16181d (CVD ΔE ≥ 9, contraste ≥ 3:1); por isso o limite de 3 exercícios.
SURFACE = "#16181d"
INK, MUTED, GRID = "#f2f3f5", "#a3a9b6", "#2f333d"
BRAND = "#76e06f"
SERIES = ["#3987e5", "#d95926", "#199e70"]
MARKERS = ["o", "s", "^"]


# ───────────── Leitura ─────────────
def load_sessions(path: str | Path) -> tuple[list[dict], dict | None, str]:
    """Lê um backup do FORJA (sem senha) ou um export de dados de teste.

    Retorna (sessões válidas, ficha ou None, origem: 'backup' | 'teste').
    """
    p = Path(path)
    if p.stat().st_size > MAX_BYTES:
        raise ValueError("Arquivo grande demais (limite de 20 MB).")
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("O arquivo não é um JSON válido.") from exc
    if not isinstance(raw, dict) or raw.get("app") not in ("forja", "forja-demo"):
        raise ValueError("Este arquivo não é uma exportação do FORJA.")
    if raw.get("encrypted") is True:
        raise ValueError("Backup protegido por senha: exporte um backup sem senha para analisar.")
    data = raw.get("data")
    if not isinstance(data, dict):
        raise ValueError("Arquivo sem dados de treino.")
    return clean_sessions(data.get("sessions")), data.get("plan"), "teste" if raw["app"] == "forja-demo" else "backup"


def _num(value, lo, hi):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and lo <= value <= hi else None


def clean_sessions(items) -> list[dict]:
    """Descarta o que for inválido (mesmas faixas do app) e ordena por data."""
    out = []
    for s in items if isinstance(items, list) else []:
        if not isinstance(s, dict) or s.get("deletedAt"):
            continue
        try:
            day = date.fromisoformat(str(s.get("date")))
        except ValueError:
            continue
        sets_by_item = []
        for it in s.get("items") or []:
            if not isinstance(it, dict) or not isinstance(it.get("exerciseId"), str):
                continue
            sets = []
            for st in it.get("sets") or []:
                w = _num(st.get("weight"), 0, 1000) if isinstance(st, dict) else None
                r = _num(st.get("reps"), 1, 100) if isinstance(st, dict) else None
                if w is not None and r is not None:
                    sets.append((w, int(r)))
            if sets:
                sets_by_item.append({
                    "exercise_id": it["exerciseId"], "name": str(it.get("name") or it["exerciseId"])[:80],
                    "group": it.get("group") if it.get("group") in GROUPS else "outros", "sets": sets,
                })
        if not sets_by_item:
            continue
        started, ended = s.get("startedAt") or 0, s.get("endedAt") or 0
        minutes = round((ended - started) / 60000) if isinstance(started, (int, float)) and isinstance(ended, (int, float)) and ended > started else 0
        out.append({"id": str(s.get("id", "")), "date": day, "title": str(s.get("title") or "Treino")[:80],
                    "minutes": minutes, "items": sets_by_item})
    return sorted(out, key=lambda x: (x["date"], x["id"]))


# ───────────── Métricas ─────────────
def e1rm(weight: float, reps: int) -> float:
    """Epley, com no máximo 15 repetições (igual ao app)."""
    return weight * (1 + min(reps, 15) / 30) if weight > 0 and reps > 0 else 0.0


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def slope(xs: list[float], ys: list[float]) -> float | None:
    """Inclinação da reta de mínimos quadrados (None sem variação em x)."""
    n = len(xs)
    if n < 2:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return None if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def session_rows(sessions: list[dict]) -> list[dict]:
    rows = []
    for s in sessions:
        sets = [st for it in s["items"] for st in it["sets"]]
        rows.append({
            "data": s["date"].isoformat(), "treino": s["title"], "exercicios": len(s["items"]),
            "series": len(sets), "volume_kg": round(sum(w * r for w, r in sets)), "duracao_min": s["minutes"],
        })
    return rows


def weekly_rows(sessions: list[dict]) -> list[dict]:
    """Uma linha por semana (inclui semanas sem treino entre a primeira e a última)."""
    if not sessions:
        return []
    acc = defaultdict(lambda: {"treinos": 0, "series": 0, "volume_kg": 0.0})
    for s in sessions:
        w = acc[week_start(s["date"])]
        w["treinos"] += 1
        for it in s["items"]:
            w["series"] += len(it["sets"])
            w["volume_kg"] += sum(a * b for a, b in it["sets"])
    first, last = week_start(sessions[0]["date"]), week_start(sessions[-1]["date"])
    rows, cur = [], first
    while cur <= last:
        v = acc.get(cur, {"treinos": 0, "series": 0, "volume_kg": 0.0})
        rows.append({"semana": cur.isoformat(), "treinos": v["treinos"], "series": v["series"], "volume_kg": round(v["volume_kg"])})
        cur += timedelta(days=7)
    return rows


def exercise_stats(sessions: list[dict]) -> list[dict]:
    hist = defaultdict(list)
    names, groups = {}, {}
    for s in sessions:
        for it in s["items"]:
            hist[it["exercise_id"]].append((s["date"], it["sets"]))
            names[it["exercise_id"]], groups[it["exercise_id"]] = it["name"], it["group"]
    out = []
    for ex_id, entries in hist.items():
        series = []
        for d, sets in entries:
            top = max(w for w, _ in sets)
            est = max(e1rm(w, r) for w, r in sets)
            best_reps = max(r for _, r in sets)
            series.append({"date": d, "top": top, "e1rm": est, "reps": best_reps,
                           "volume": sum(w * r for w, r in sets), "score": est if est > 0 else float(best_reps)})
        records, best = [], 0.0
        for i, p in enumerate(series):
            if i and p["score"] > best:
                records.append(p["date"])
            best = max(best, p["score"])
        days = (series[-1]["date"] - series[0]["date"]).days
        trend = slope([(p["date"] - series[0]["date"]).days / 7 for p in series], [p["score"] for p in series]) if len(series) >= 3 and days >= 14 else None
        stagnated = False
        if len(series) >= STAGNATION_WINDOW + 1:
            base = series[-STAGNATION_WINDOW - 1]["score"]
            stagnated = base > 0 and max(p["score"] for p in series[-STAGNATION_WINDOW:]) <= base * 1.01
        first, last = series[0]["score"], series[-1]["score"]
        out.append({
            "exercise_id": ex_id, "name": names[ex_id], "group": groups[ex_id], "sessions": len(series),
            "top_weight": max(p["top"] for p in series), "first_score": first, "last_score": last,
            "change_pct": ((last - first) / first * 100) if first > 0 else None,
            "trend_per_week": trend, "stagnated": stagnated, "records": records,
            "bodyweight": all(p["top"] == 0 for p in series), "series": series,
            "volume": sum(p["volume"] for p in series),
        })
    return sorted(out, key=lambda e: (-e["sessions"], -e["volume"], e["name"]))


def group_stats(sessions: list[dict], weeks: int) -> list[dict]:
    acc = defaultdict(lambda: {"series": 0, "volume": 0.0})
    for s in sessions:
        for it in s["items"]:
            g = acc[it["group"]]
            g["series"] += len(it["sets"])
            g["volume"] += sum(w * r for w, r in it["sets"])
    rows = [{"grupo": GROUPS.get(k, "Outros"), "series": v["series"], "volume_kg": round(v["volume"]),
             "series_por_semana": round(v["series"] / max(1, weeks), 1)} for k, v in acc.items()]
    return sorted(rows, key=lambda r: -r["series"])


def analyze(sessions: list[dict], plan: dict | None = None) -> dict:
    if not sessions:
        raise ValueError("Nenhum treino válido encontrado no arquivo.")
    weekly = weekly_rows(sessions)
    rows = session_rows(sessions)
    active = [w for w in weekly if w["treinos"]]
    longest = cur = 0
    for w in weekly:
        cur = cur + 1 if w["treinos"] else 0
        longest = max(longest, cur)
    planned = len(plan["days"]) if isinstance(plan, dict) and isinstance(plan.get("days"), list) and plan["days"] else None
    durations = [r["duracao_min"] for r in rows if r["duracao_min"]]
    exercises = exercise_stats(sessions)
    return {
        "periodo": {"inicio": sessions[0]["date"].isoformat(), "fim": sessions[-1]["date"].isoformat(), "semanas": len(weekly)},
        "totais": {"treinos": len(rows), "series": sum(r["series"] for r in rows), "volume_kg": sum(r["volume_kg"] for r in rows),
                   "volume_medio_por_treino_kg": round(sum(r["volume_kg"] for r in rows) / len(rows)),
                   "duracao_media_min": round(sum(durations) / len(durations)) if durations else None},
        "consistencia": {"semanas_ativas": len(active), "semanas_sem_treino": len(weekly) - len(active),
                         "treinos_por_semana": round(len(rows) / len(weekly), 2), "maior_sequencia_semanas": longest,
                         "dias_planejados_por_semana": planned,
                         "aderencia_pct": round(len(rows) / (len(weekly) * planned) * 100) if planned else None},
        "semanal": weekly, "sessoes": rows, "grupos": group_stats(sessions, len(weekly)),
        "exercicios": exercises,
    }


# ───────────── Relatório em texto ─────────────
def br(n, dec=1) -> str:
    return f"{n:,.{dec}f}".replace(",", "§").replace(".", ",").replace("§", ".")


def render_report(r: dict, origem: str = "backup") -> str:
    p, t, c = r["periodo"], r["totais"], r["consistencia"]
    lines = [f"FORJA — análise de treinos ({'DADOS DE TESTE' if origem == 'teste' else 'backup'})", "=" * 60,
             f"Período: {p['inicio']} a {p['fim']} ({p['semanas']} semanas)",
             f"Treinos: {t['treinos']} · séries: {t['series']} · volume total: {br(t['volume_kg'], 0)} kg",
             f"Volume médio por treino: {br(t['volume_medio_por_treino_kg'], 0)} kg"
             + (f" · duração média: {t['duracao_media_min']} min" if t["duracao_media_min"] else ""), "",
             "Consistência", "-" * 60,
             f"{br(c['treinos_por_semana'], 2)} treinos/semana · {c['semanas_ativas']} semanas ativas de {p['semanas']} · maior sequência: {c['maior_sequencia_semanas']} semanas"]
    if c["aderencia_pct"] is not None:
        lines.append(f"Aderência à ficha ({c['dias_planejados_por_semana']} dias/semana): {c['aderencia_pct']}%")
    lines += ["", "Volume semanal (últimas 8 semanas, kg)", "-" * 60]
    lines += [f"  {w['semana']}  {w['treinos']} treino(s)  {br(w['volume_kg'], 0):>10}" for w in r["semanal"][-8:]]
    lines += ["", "Séries por grupo muscular", "-" * 60]
    lines += [f"  {g['grupo']:<20} {g['series']:>4} séries  (≈ {br(g['series_por_semana'])}/semana)" for g in r["grupos"]]
    lines += ["", "Exercícios (mais frequentes primeiro)", "-" * 60,
              f"  {'Exercício':<30} {'Sess.':>5} {'Início → Fim (1RM est./reps)':>30} {'Tend./sem':>10}  Status"]
    for e in r["exercicios"][:12]:
        unit = "reps" if e["bodyweight"] else "kg"
        trend = "—" if e["trend_per_week"] is None else f"{e['trend_per_week']:+.2f}".replace(".", ",")
        status = "possível estagnação" if e["stagnated"] else ("em alta" if (e["trend_per_week"] or 0) > 0 else "estável")
        lines.append(f"  {e['name'][:30]:<30} {e['sessions']:>5} {br(e['first_score']):>12} → {br(e['last_score']):<8} {unit:<4} {trend:>10}  {status}")
    stag = [e for e in r["exercicios"] if e["stagnated"]]
    recs = sorted(((d, e["name"]) for e in r["exercicios"] for d in e["records"]), reverse=True)[:5]
    if recs:
        lines += ["", "Recordes mais recentes", "-" * 60] + [f"  {d}  {n}" for d, n in recs]
    if stag:
        lines += ["", "Possíveis estagnações (3 sessões sem superar em 1%)", "-" * 60] + [f"  • {e['name']}" for e in stag]
    lines += ["", "Leitura: indicadores descritivos dos seus registros; não substituem orientação profissional."]
    return "\n".join(lines)


# ───────────── Saídas ─────────────
def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def write_outputs(r: dict, out: Path, origem: str) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    files = []
    slim = {k: v for k, v in r.items() if k != "exercicios"}
    slim["origem"] = origem
    slim["exercicios"] = [{k: (v.isoformat() if isinstance(v, date) else v) for k, v in e.items() if k not in ("series", "records")}
                          | {"recordes": [d.isoformat() for d in e["records"]]} for e in r["exercicios"]]
    (out / "resumo.json").write_text(json.dumps(slim, ensure_ascii=False, indent=2), encoding="utf-8")
    files.append(out / "resumo.json")
    for name, rows in (("sessoes.csv", r["sessoes"]), ("semanal.csv", r["semanal"]), ("grupos.csv", r["grupos"])):
        write_csv(out / name, rows)
        files.append(out / name)
    series = [{"exercicio": e["name"], "data": p["date"].isoformat(), "carga_max_kg": p["top"], "1rm_estimado_kg": round(p["e1rm"], 2),
               "melhor_reps": p["reps"], "volume_kg": round(p["volume"])} for e in r["exercicios"] for p in e["series"]]
    write_csv(out / "series_por_exercicio.csv", series)
    files.append(out / "series_por_exercicio.csv")
    return files


def _style(plt):
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": GRID, "axes.labelcolor": MUTED, "text.color": INK, "xtick.color": MUTED, "ytick.color": MUTED,
        "grid.color": GRID, "grid.linewidth": 0.8, "axes.grid": True, "axes.axisbelow": True, "axes.spines.top": False,
        "axes.spines.right": False, "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left",
    })


def write_charts(r: dict, out: Path, top: int = 3) -> list[Path]:
    """Gera os PNG. Retorna [] se o matplotlib não estiver instalado."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.dates as mdates
        import matplotlib.pyplot as plt
    except ImportError:
        return []
    _style(plt)
    out.mkdir(parents=True, exist_ok=True)
    files = []
    weeks = [date.fromisoformat(w["semana"]) for w in r["semanal"]]

    # 1) Volume e frequência por semana (dois painéis, cada um com seu eixo)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8, 5.4), sharex=True, gridspec_kw={"height_ratios": [3, 1.4]})
    a1.bar(weeks, [w["volume_kg"] for w in r["semanal"]], width=5.2, color=BRAND)
    a1.set_title("Volume semanal (kg)")
    a1.grid(axis="x", visible=False)
    a2.bar(weeks, [w["treinos"] for w in r["semanal"]], width=5.2, color=BRAND)
    a2.set_title("Treinos por semana", fontsize=10)
    a2.set_yticks(range(0, max(w["treinos"] for w in r["semanal"]) + 2))
    a2.grid(axis="x", visible=False)
    a2.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m"))
    fig.autofmt_xdate(rotation=0, ha="center")
    fig.tight_layout()
    fig.savefig(out / "volume_semanal.png", dpi=160)
    plt.close(fig)
    files.append(out / "volume_semanal.png")

    # 2) 1RM estimado dos exercícios mais frequentes (até 3: limite da paleta validada)
    chosen = [e for e in r["exercicios"] if not e["bodyweight"] and e["sessions"] >= 2][: max(1, min(top, 3))]
    if chosen:
        fig, ax = plt.subplots(figsize=(8, 4.6))
        for i, e in enumerate(chosen):
            xs = [p["date"] for p in e["series"]]
            ys = [p["e1rm"] for p in e["series"]]
            ax.plot(xs, ys, color=SERIES[i], lw=2, marker=MARKERS[i], ms=6, mec=SURFACE, mew=1.5, label=e["name"])
            ax.annotate(e["name"], (xs[-1], ys[-1]), xytext=(6, 0), textcoords="offset points", va="center", color=INK, fontsize=9)
        ax.set_title("1RM estimado por exercício (kg)")
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m"))
        ax.margins(x=0.28)
        ax.legend(frameon=False, loc="upper left", labelcolor=INK)
        fig.tight_layout()
        fig.savefig(out / "evolucao_1rm.png", dpi=160)
        plt.close(fig)
        files.append(out / "evolucao_1rm.png")

    # 3) Séries por grupo muscular
    groups = r["grupos"][::-1]
    fig, ax = plt.subplots(figsize=(8, max(3, 0.42 * len(groups) + 1.4)))
    ax.barh([g["grupo"] for g in groups], [g["series"] for g in groups], height=0.62, color=BRAND)
    ax.set_title("Séries por grupo muscular")
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    fig.savefig(out / "series_por_grupo.png", dpi=160)
    plt.close(fig)
    files.append(out / "series_por_grupo.png")
    return files


# ───────────── Linha de comando ─────────────
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Análise dos treinos do FORJA (backup ou dados de teste).")
    ap.add_argument("arquivo", help="JSON exportado pelo app (sem senha)")
    ap.add_argument("--out", help="pasta para gravar CSV, JSON e gráficos")
    ap.add_argument("--top", type=int, default=3, help="quantos exercícios no gráfico de 1RM (máx. 3)")
    ap.add_argument("--no-charts", action="store_true", help="não gerar PNG")
    args = ap.parse_args(argv)
    try:
        sessions, plan, origem = load_sessions(args.arquivo)
        result = analyze(sessions, plan)
    except (OSError, ValueError) as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 1
    print(render_report(result, origem))
    if args.out:
        out = Path(args.out)
        files = write_outputs(result, out, origem)
        if not args.no_charts:
            charts = write_charts(result, out, args.top)
            if not charts:
                print("\n(Gráficos ignorados: instale o matplotlib com `pip install matplotlib`.)")
            files += charts
        print("\nArquivos gerados:\n" + "\n".join(f"  {f}" for f in files))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
