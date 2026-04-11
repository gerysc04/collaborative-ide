from motor.motor_asyncio import AsyncIOMotorClient
import os

client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
db = client.collaborative_ide

sessions_collection = db.sessions