import os
import sys
from pathlib import Path

os.environ["SITE_URL"] = "https://freehandyly.com"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["CONTACT_LOG_DIR"] = str(Path(__file__).parent / ".tmp-contact")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from app import app  # noqa: E402


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()
