import datetime as dt
import unittest

try:
    import pes_automation as pes
except ImportError:
    pes = None


class AutomationTests(unittest.TestCase):
    def test_rolling_window_handles_year_and_leap_boundaries(self):
        self.assertIsNotNone(pes, 'PES automation is not implemented')
        self.assertEqual(pes.date_window(dt.date(2026, 10, 26)), (dt.date(2026, 9, 1), dt.date(2026, 11, 30)))
        self.assertEqual(pes.date_window(dt.date(2026, 1, 1)), (dt.date(2025, 12, 1), dt.date(2026, 2, 28)))
        self.assertEqual(pes.date_window(dt.date(2024, 1, 31)), (dt.date(2023, 12, 1), dt.date(2024, 2, 29)))
        self.assertEqual(pes.date_window(dt.date(2026, 12, 31)), (dt.date(2026, 11, 1), dt.date(2027, 1, 31)))

    def test_export_preserves_all_selected_task_details(self):
        import json
        import pathlib
        import tempfile
        self.assertTrue(hasattr(pes, 'export_report'), 'Report export is not implemented')
        fixture = pathlib.Path(__file__).parent / 'evidence'
        raw = json.loads((fixture / 'pes_filtered_raw.json').read_text(encoding='utf-8'))
        histories = json.loads((fixture / 'pes_task_histories.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            result = pes.export_report(raw, histories, pathlib.Path(tmp), dt.date(2026, 10, 26))
            report = json.loads(pathlib.Path(result['json']).read_text(encoding='utf-8'))
            self.assertEqual(report['counts'], {'Approval': 8, 'Open': 0})
            self.assertEqual(report['total_scanned'], 32)
            self.assertEqual(len(report['tasks']), 8)
            self.assertEqual(len({t['TaskNo'] for t in report['tasks']}), 8)
            self.assertEqual(sum(t['overdue'] for t in report['tasks']), 2)
            self.assertTrue(all(t['history']['text'] for t in report['tasks']))
            for kind in ['json', 'csv', 'markdown']:
                self.assertTrue(pathlib.Path(result[kind]).stat().st_size > 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
