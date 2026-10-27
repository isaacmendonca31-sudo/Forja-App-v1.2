"""Testes do analisador em Python (somente biblioteca padrão). Execute: python3 -m unittest discover -s tests -p 'test_*.py'"""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import analyze  # noqa: E402


def sess(day, ex, sets, sid=None, title="T", started=0, ended=0):
    return {"id": sid or f"s-{day}-{ex}", "date": day, "title": title, "startedAt": started, "endedAt": ended,
            "items": [{"exerciseId": ex, "name": ex, "group": "peito", "sets": [{"weight": w, "reps": r} for w, r in sets]}]}


class AnalyzeTests(unittest.TestCase):
    def test_epley_igual_ao_app(self):
        self.assertAlmostEqual(analyze.e1rm(40, 10), 40 * (1 + 10 / 30))
        self.assertAlmostEqual(analyze.e1rm(40, 30), 40 * 1.5)  # limitado a 15 repetições
        self.assertEqual(analyze.e1rm(0, 10), 0)

    def test_limpa_dados_invalidos(self):
        raw = [sess("2026-10-01", "x", [(40, 10)]), sess("data-ruim", "x", [(40, 10)]),
               sess("2026-10-02", "x", [(-5, 10), (40, 0), (40, 8)]), {"date": "2026-10-03", "items": "x"}, "lixo",
               {**sess("2026-10-04", "x", [(40, 10)]), "deletedAt": 5}]
        out = analyze.clean_sessions(raw)
        self.assertEqual([s["date"] for s in out], [date(2026, 10, 1), date(2026, 10, 2)])
        self.assertEqual(out[1]["items"][0]["sets"], [(40.0, 8)])

    def test_semanas_sem_treino_entram_na_serie(self):
        s = analyze.clean_sessions([sess("2026-09-07", "x", [(40, 10)]), sess("2026-09-21", "x", [(40, 10)])])
        w = analyze.weekly_rows(s)
        self.assertEqual([r["treinos"] for r in w], [1, 0, 1])
        self.assertEqual(w[0]["semana"], "2026-09-07")

    def test_tendencia_e_estagnacao(self):
        up = analyze.clean_sessions([sess(f"2026-09-{d:02d}", "x", [(40 + i * 2.5, 10)]) for i, d in enumerate((1, 8, 15, 22, 29 - 0))])
        e = analyze.exercise_stats(up)[0]
        self.assertGreater(e["trend_per_week"], 0)
        self.assertFalse(e["stagnated"])
        flat = analyze.clean_sessions([sess(f"2026-09-{d:02d}", "x", [(40, 10)]) for d in (1, 8, 15, 22)])
        self.assertTrue(analyze.exercise_stats(flat)[0]["stagnated"])

    def test_recordes_ignoram_o_primeiro_registro(self):
        s = analyze.clean_sessions([sess("2026-09-01", "x", [(40, 10)]), sess("2026-09-08", "x", [(40, 10)]), sess("2026-09-15", "x", [(45, 10)])])
        self.assertEqual(analyze.exercise_stats(s)[0]["records"], [date(2026, 9, 15)])

    def test_totais_e_duracao(self):
        s = analyze.clean_sessions([sess("2026-10-01", "x", [(40, 10), (40, 8)], started=0, ended=45 * 60000)])
        r = analyze.analyze(s)
        self.assertEqual(r["totais"]["series"], 2)
        self.assertEqual(r["totais"]["volume_kg"], 720)
        self.assertEqual(r["totais"]["duracao_media_min"], 45)

    def test_sem_treinos_da_erro_claro(self):
        with self.assertRaises(ValueError):
            analyze.analyze([])

    def test_arquivo_e_validado(self):
        with tempfile.TemporaryDirectory() as d:
            def write(name, obj):
                p = Path(d) / name
                p.write_text(json.dumps(obj), encoding="utf-8")
                return p
            ok = write("a.json", {"app": "forja-demo", "data": {"sessions": [sess("2026-10-01", "x", [(40, 10)])]}})
            self.assertEqual(analyze.load_sessions(ok)[2], "teste")
            with self.assertRaises(ValueError):
                analyze.load_sessions(write("b.json", {"app": "outro"}))
            with self.assertRaisesRegex(ValueError, "senha"):
                analyze.load_sessions(write("c.json", {"app": "forja", "encrypted": True}))
            bad = Path(d) / "d.json"
            bad.write_text("{nao", encoding="utf-8")
            with self.assertRaises(ValueError):
                analyze.load_sessions(bad)

    def test_saidas_csv_json_e_relatorio(self):
        s = analyze.clean_sessions([sess(f"2026-09-{d:02d}", "supino", [(40 + d, 10)]) for d in (1, 8, 15)])
        r = analyze.analyze(s)
        self.assertIn("Supino".lower(), analyze.render_report(r).lower().replace("supino", "supino"))
        with tempfile.TemporaryDirectory() as d:
            files = analyze.write_outputs(r, Path(d), "teste")
            names = {f.name for f in files}
            self.assertTrue({"resumo.json", "sessoes.csv", "semanal.csv", "grupos.csv", "series_por_exercicio.csv"} <= names)
            self.assertEqual(json.loads((Path(d) / "resumo.json").read_text(encoding="utf-8"))["origem"], "teste")


if __name__ == "__main__":
    unittest.main()
