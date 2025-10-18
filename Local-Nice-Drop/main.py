from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import json
import random
import asyncio
from typing import Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("local-nice-drop")

app = FastAPI(title="Local-Nice-Drop")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.device_names: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.device_names[client_id] = f"Устройство {client_id}"
        logger.info(f"🔗 {client_id} подключился")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.device_names:
            del self.device_names[client_id]
        logger.info(f"🔌 {client_id} отключился")

    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
                return True
            except:
                self.disconnect(client_id)
                return False
        return False

    async def broadcast_peers_update(self):
        for client_id in self.active_connections:
            await self.send_personal_message({
                "type": "peers_updated"
            }, client_id)

manager = ConnectionManager()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get():
    return HTMLResponse(open("static/index.html", encoding="utf-8").read())

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "update_device_name":
                manager.device_names[client_id] = message["name"]
                await manager.broadcast_peers_update()
                logger.info(f"📝 {client_id} сменил имя на: {message['name']}")
                
            elif message["type"] == "discover_peers":
                peers = []
                for peer_id in manager.active_connections.keys():
                    if peer_id != client_id:
                        peers.append({
                            "id": peer_id,
                            "name": manager.device_names.get(peer_id, f"Устройство {peer_id}")
                        })
                
                await manager.send_personal_message({
                    "type": "peers_list",
                    "peers": peers
                }, client_id)
                
            elif message["type"] == "file_offer":
                target_id = message["target"]
                file_info = message["file_info"]
                
                logger.info(f"📨 {client_id} -> {target_id}: {file_info['name']} ({file_info['size']} bytes)")
                
                success = await manager.send_personal_message({
                    "type": "file_offer",
                    "from": client_id,
                    "from_name": manager.device_names[client_id],
                    "file_info": file_info
                }, target_id)
                
                if success:
                    await manager.send_personal_message({
                        "type": "file_offer_sent",
                        "file_name": file_info["name"]
                    }, client_id)
                else:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "Устройство недоступно"
                    }, client_id)
                    
            elif message["type"] == "file_accept":
                from_client = message["from"]
                file_name = message["file_name"]
                
                logger.info(f"✅ Файл принят: {file_name}")
                
                await manager.send_personal_message({
                    "type": "file_accepted",
                    "file_name": file_name,
                    "to_name": manager.device_names[client_id]
                }, from_client)
                
            elif message["type"] == "file_reject":
                from_client = message["from"]
                file_name = message["file_name"]
                
                await manager.send_personal_message({
                    "type": "file_rejected", 
                    "file_name": file_name
                }, from_client)
                
            elif message["type"] == "file_chunk":
                target_id = message["target"]
                chunk_data = message["chunk_data"]
                file_name = message["file_name"]
                chunk_index = message["chunk_index"]
                total_chunks = message["total_chunks"]
                
                await manager.send_personal_message({
                    "type": "file_chunk",
                    "chunk_data": chunk_data,
                    "file_name": file_name,
                    "chunk_index": chunk_index,
                    "total_chunks": total_chunks,
                    "from_name": manager.device_names[client_id]
                }, target_id)
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        await manager.broadcast_peers_update()

if __name__ == "__main__":
    import uvicorn
    print("🪂 Запуск Local-Nice-Drop...")
    print("📡 Сервер будет доступен по: http://localhost:8000") 
    print("💡 Остановка: Ctrl+C")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8000)