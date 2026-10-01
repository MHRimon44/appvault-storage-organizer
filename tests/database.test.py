"""Exercise the real CREATE statements and duplicate aggregation from the Kotlin database."""
import pathlib
import re
import sqlite3
import unittest

source = (pathlib.Path(__file__).resolve().parents[1] / 'native/android/VaultDatabase.kt').read_text()

class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        statements = re.findall(r'db\.execSQL\("""(CREATE TABLE.*?)"""\)', source, re.S)
        statements += re.findall(r'db\.execSQL\("(CREATE TABLE[^"\n]+)"\)', source)
        self.assertEqual(len(statements), 7)
        for sql in statements:
            self.db.execute(sql)

    def insert(self, id, identity, size=100, modified=1000, available=1):
        self.db.execute('INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (id, 'content://media/' + id, identity, id + '.pdf', 'pdf', 'application/pdf', 'pdfs', size, 0, modified, 'Download/', 0, 0, 0, 'media:images', available, 1, 1, 1))

    def stats(self):
        query = re.search(r'val sql="(SELECT COUNT\(\*\),COALESCE\(SUM\(\(copies-1\).*?)"', source).group(1)
        return self.db.execute(query).fetchone()

    def test_physical_aliases_cannot_be_indexed_twice(self):
        self.insert('media', 'local:primary:Download/file.pdf')
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert('saf', 'local:primary:Download/file.pdf')

    def test_matching_sizes_without_hashes_are_not_duplicates(self):
        self.insert('a', 'local:primary:a')
        self.insert('b', 'local:primary:b')
        self.assertEqual(self.stats(), (0, 0))

    def test_savings_exclude_one_copy_and_reject_stale_hashes(self):
        for id in ['a', 'b', 'c']:
            self.insert(id, 'local:primary:' + id)
            self.db.execute('INSERT INTO file_hashes VALUES(?,?,?,?,?)', (id, 100, 1000, 'samehash', 1))
        self.assertEqual(self.stats(), (1, 200))
        self.db.execute('UPDATE files SET dateModified=2000 WHERE id="c"')
        self.assertEqual(self.stats(), (1, 100))
        self.db.execute('UPDATE files SET available=0 WHERE id="b"')
        self.assertEqual(self.stats(), (0, 0))

    def test_favorites_survive_unavailable_references(self):
        self.insert('a', 'local:primary:a')
        self.db.execute('INSERT INTO favorites VALUES(?,?)', ('a', 1))
        self.db.execute('UPDATE files SET available=0 WHERE id="a"')
        self.assertEqual(self.db.execute('SELECT count(*) FROM favorites').fetchone()[0], 1)

    def test_delete_cascades_hashes_and_favorites(self):
        self.insert('a', 'local:primary:a')
        self.db.execute('INSERT INTO favorites VALUES(?,?)', ('a', 1))
        self.db.execute('INSERT INTO file_hashes VALUES(?,?,?,?,?)', ('a', 100, 1000, 'hash', 1))
        self.db.execute('DELETE FROM files WHERE id="a"')
        self.assertEqual(self.db.execute('SELECT count(*) FROM favorites').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM file_hashes').fetchone()[0], 0)

if __name__ == '__main__':
    unittest.main()
