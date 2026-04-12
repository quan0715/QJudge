import importlib


TEST_ENV_KEYS = [
    "DATABASE_URL",
    "POSTGRES_HOST",
    "POSTGRES_DIRECT_HOST",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_PORT",
    "DB_HOST",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_PORT",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_PORT",
]


def load_test_settings(monkeypatch, **env):
    for key in TEST_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import config.settings.test as test_settings_module

    return importlib.reload(test_settings_module)


def test_test_settings_use_db_env_vars_for_dev_compose(monkeypatch):
    settings_module = load_test_settings(
        monkeypatch,
        DB_HOST="postgres",
        DB_NAME="online_judge",
        DB_USER="postgres",
        DB_PASSWORD="postgres",
        DB_PORT="5432",
    )

    database = settings_module.DATABASES["default"]

    assert database["HOST"] == "postgres"
    assert database["NAME"] == "online_judge"
    assert database["USER"] == "postgres"
    assert database["PASSWORD"] == "postgres"
    assert database["PORT"] == "5432"


def test_test_settings_bypass_pgbouncer_for_database_creation(monkeypatch):
    settings_module = load_test_settings(
        monkeypatch,
        DB_HOST="pgbouncer",
        DB_NAME="online_judge",
        DB_USER="postgres",
        DB_PASSWORD="postgres",
        DB_PORT="5432",
    )

    database = settings_module.DATABASES["default"]

    assert database["HOST"] == "postgres"
