"""Align databases built by the pre-baseline migration history with the baseline schema.

Databases created before the migration reset carry objects left behind by raw SQL
cutovers: hand-written index and constraint names, database-level ON DELETE rules,
redundant unique constraints and column defaults. Each app's
``align_legacy_schema`` migration passes the catalog produced by the baseline
migrations; objects are matched by definition, renamed to the baseline name when
equivalent, and otherwise dropped or recreated. On a database created from the
baseline every object already matches and nothing is executed.
"""

import re
from dataclasses import dataclass

_INDEX_NAME_PATTERN = re.compile(r"^CREATE (UNIQUE )?INDEX \S+ ON (ONLY )?(\S+\.)?")


@dataclass(frozen=True)
class _Constraint:
    table: str
    name: str
    kind: str
    definition: str
    index_oid: int = 0


@dataclass(frozen=True)
class _Index:
    table: str
    name: str
    definition: str

    @property
    def signature(self):
        return _INDEX_NAME_PATTERN.sub(r"CREATE \1INDEX ON ", self.definition)

    @property
    def shape(self):
        # PostgreSQL re-deparses partial index predicates written as text (for example
        # ARRAY casts), so an index keeping its baseline name is compared without them.
        return self.signature.split(" WHERE ", 1)[0]


def build_alignment(expected_constraints, expected_indexes):
    """Return a RunPython callable aligning the tables named in the catalog."""
    constraints = [_Constraint(*row) for row in expected_constraints]
    indexes = [_Index(*row) for row in expected_indexes]
    tables = sorted({item.table for item in [*constraints, *indexes]})

    def align(apps, schema_editor):
        connection = schema_editor.connection
        if connection.vendor != "postgresql":
            return
        quote = schema_editor.quote_name
        with connection.cursor() as cursor:
            _drop_column_defaults(cursor, tables, quote)
            _align_constraints(cursor, tables, constraints, quote)
            _align_indexes(cursor, tables, indexes, quote)
            _assert_aligned(cursor, tables, constraints, indexes)

    return align


def _drop_column_defaults(cursor, tables, quote):
    cursor.execute(
        """
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ANY(%s)
          AND column_default IS NOT NULL
          AND is_identity = 'NO'
        """,
        [tables],
    )
    for table, column in cursor.fetchall():
        cursor.execute(f"ALTER TABLE {quote(table)} ALTER COLUMN {quote(column)} DROP DEFAULT")


def _load_constraints(cursor, tables):
    cursor.execute(
        """
        SELECT t.relname, c.conname, c.contype, pg_get_constraintdef(c.oid), c.conindid
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = ANY(%s)
        ORDER BY t.relname, c.conname
        """,
        [tables],
    )
    return [_Constraint(*row) for row in cursor.fetchall()]


def _load_indexes(cursor, tables):
    cursor.execute(
        """
        SELECT t.relname, i.relname, pg_get_indexdef(i.oid)
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema()
          AND t.relname = ANY(%s)
          AND NOT EXISTS (
              SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid AND c.conrelid = t.oid
          )
        ORDER BY t.relname, i.relname
        """,
        [tables],
    )
    return [_Index(*row) for row in cursor.fetchall()]


def _match(expected, actual, same_name, equivalent):
    """Pair expected objects with actual ones: first by identity, then by definition."""
    remaining = list(actual)
    kept, renames, missing = [], [], []
    for item in expected:
        found = next((a for a in remaining if same_name(item, a)), None)
        if found:
            remaining.remove(found)
            kept.append((found, item))
        else:
            missing.append(item)
    added = []
    for item in missing:
        found = next((a for a in remaining if equivalent(item, a)), None)
        if found:
            remaining.remove(found)
            renames.append((found, item))
        else:
            added.append(item)
    return kept, renames, added, remaining


def _align_constraints(cursor, tables, expected, quote):
    actual = _load_constraints(cursor, tables)
    kept, renames, added, dropped = _match(
        expected,
        actual,
        same_name=lambda e, a: (e.table, e.name, e.kind, e.definition) == (a.table, a.name, a.kind, a.definition),
        equivalent=lambda e, a: (e.table, e.kind, e.definition) == (a.table, a.kind, a.definition),
    )

    # A foreign key bound to a unique index that is about to be dropped must be
    # dropped first and recreated afterwards, where it binds to the primary key.
    dropped_index_oids = [c.index_oid for c in dropped if c.kind in ("p", "u")]
    dependents = _dependent_foreign_keys(cursor, dropped_index_oids)
    dependent_keys = {(c.table, c.name) for c in dependents}
    expected_by_actual = {(a.table, a.name): e for a, e in [*kept, *renames]}
    readded = []
    for dependent in dependents:
        key = (dependent.table, dependent.name)
        if key in expected_by_actual:
            readded.append(expected_by_actual[key])
        elif dependent.table not in tables:
            readded.append(dependent)
        # Otherwise the key is drift itself and its baseline version is already in ``added``.
    kept = [pair for pair in kept if (pair[0].table, pair[0].name) not in dependent_keys]
    renames = [pair for pair in renames if (pair[0].table, pair[0].name) not in dependent_keys]
    dropped = [c for c in dropped if (c.table, c.name) not in dependent_keys]

    for constraint in sorted([*dependents, *dropped], key=lambda c: c.kind != "f"):
        cursor.execute(f"ALTER TABLE {quote(constraint.table)} DROP CONSTRAINT {quote(constraint.name)}")

    temporary = []
    for position, (current, target) in enumerate(renames):
        placeholder = f"legacy_align_constraint_{position}"
        cursor.execute(
            f"ALTER TABLE {quote(current.table)} RENAME CONSTRAINT {quote(current.name)} TO {quote(placeholder)}"
        )
        temporary.append((placeholder, target))
    for placeholder, target in temporary:
        cursor.execute(
            f"ALTER TABLE {quote(target.table)} RENAME CONSTRAINT {quote(placeholder)} TO {quote(target.name)}"
        )

    for constraint in sorted([*added, *readded], key=lambda c: c.kind == "f"):
        cursor.execute(
            f"ALTER TABLE {quote(constraint.table)} ADD CONSTRAINT {quote(constraint.name)} {constraint.definition}"
        )


def _dependent_foreign_keys(cursor, index_oids):
    if not index_oids:
        return []
    cursor.execute(
        """
        SELECT t.relname, c.conname, c.contype, pg_get_constraintdef(c.oid), c.conindid
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.contype = 'f' AND c.conindid = ANY(%s)
        ORDER BY t.relname, c.conname
        """,
        [index_oids],
    )
    return [_Constraint(*row) for row in cursor.fetchall()]


def _align_indexes(cursor, tables, expected, quote):
    actual = _load_indexes(cursor, tables)
    _, renames, added, dropped = _match(
        expected,
        actual,
        same_name=lambda e, a: (e.table, e.name, e.shape) == (a.table, a.name, a.shape),
        equivalent=lambda e, a: (e.table, e.signature) == (a.table, a.signature),
    )
    for index in dropped:
        cursor.execute(f"DROP INDEX {quote(index.name)}")

    temporary = []
    for position, (current, target) in enumerate(renames):
        placeholder = f"legacy_align_index_{position}"
        cursor.execute(f"ALTER INDEX {quote(current.name)} RENAME TO {quote(placeholder)}")
        temporary.append((placeholder, target))
    for placeholder, target in temporary:
        cursor.execute(f"ALTER INDEX {quote(placeholder)} RENAME TO {quote(target.name)}")

    for index in added:
        cursor.execute(index.definition)


def _assert_aligned(cursor, tables, constraints, indexes):
    actual_constraints = {(c.table, c.name, c.kind, c.definition) for c in _load_constraints(cursor, tables)}
    expected_constraints = {(c.table, c.name, c.kind, c.definition) for c in constraints}
    actual_indexes = {(i.table, i.name, i.shape) for i in _load_indexes(cursor, tables)}
    expected_indexes = {(i.table, i.name, i.shape) for i in indexes}
    problems = sorted(actual_constraints ^ expected_constraints) + sorted(actual_indexes ^ expected_indexes)
    if problems:
        raise RuntimeError(f"Legacy schema alignment left differences: {problems}")
