from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    owner: str
    collaborators: list[str] = []
    language: str = "javascript"
    code: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    container_id: Optional[str] = None