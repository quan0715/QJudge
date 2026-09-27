import unittest

from qjudge_cli.envfile import parse


class ParseTests(unittest.TestCase):
    def test_reads_key_values(self):
        self.assertEqual(parse("A=1\nB=two\n"), {"A": "1", "B": "two"})

    def test_skips_comments_and_blank_lines(self):
        self.assertEqual(parse("# note\n\n# A=1\nB=2\n"), {"B": "2"})

    def test_strips_matching_quotes(self):
        self.assertEqual(parse("A=\"x y\"\nB='z'\n"), {"A": "x y", "B": "z"})

    def test_keeps_equals_in_value(self):
        self.assertEqual(parse("A=b=c\n"), {"A": "b=c"})

    def test_accepts_export_prefix(self):
        self.assertEqual(parse("export A=1\n"), {"A": "1"})

    def test_empty_value_is_kept_as_empty_string(self):
        self.assertEqual(parse("A=\n"), {"A": ""})

    def test_strips_inline_comment_like_compose(self):
        self.assertEqual(parse("A=https://j.example.edu # prod\n"), {"A": "https://j.example.edu"})

    def test_keeps_hash_without_leading_space(self):
        self.assertEqual(parse("A=a#b\n"), {"A": "a#b"})

    def test_keeps_hash_inside_quotes_and_drops_trailing_comment(self):
        self.assertEqual(parse("A=\"x # y\" # note\n"), {"A": "x # y"})


if __name__ == "__main__":
    unittest.main()
