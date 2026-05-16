"""
Run ONCE locally to generate a Telethon string session.
Login with your phone number; the printed string goes into TG_SESSION.

Usage:
    pip install -r requirements.txt
    python login_helper.py
"""
import os
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
from dotenv import load_dotenv

load_dotenv()

API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]

with TelegramClient(StringSession(), API_ID, API_HASH) as client:
    print("\n=== Copy this into TG_SESSION ===\n")
    print(client.session.save())
    print("\n=================================\n")
