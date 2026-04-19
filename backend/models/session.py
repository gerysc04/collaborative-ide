from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    owner: str
    collaborators: list[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    containers: dict[str, str] = {}       # branch_name → container_id
    snapshots: dict[str, str] = {}        # branch_name → snapshot image name
    default_branch: str = "main"
    status: str = "running"               # "running" | "stopped"
    db_container_id: Optional[str] = None
    db_snapshot_image: Optional[str] = None
    db_type: Optional[str] = None
    network_name: Optional[str] = None
    repo_url: Optional[str] = None
    github_username: Optional[str] = None
    ports: list[dict] = []
    ai_providers: list[dict] = []  # {tag, provider, display_name, key_ciphertext, key_iv}
