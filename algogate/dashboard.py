from __future__ import annotations

import asyncio
import json
from collections import deque
from datetime import datetime, timezone
from html import escape
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse


class AlgoGateDashboard:
    def __init__(self, max_events: int = 100) -> None:
        self._connections: set[WebSocket] = set()
        self._events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
            history = list(self._events)
        await websocket.send_json({"type": "history", "events": history})

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast_payment(
        self,
        *,
        tx_id: str,
        route: str,
        amount: int,
        caller_ip: str,
        session_issued: bool,
    ) -> None:
        event = {
            "tx_id": tx_id,
            "route": route,
            "amount": amount,
            "caller_ip": caller_ip,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_issued": session_issued,
        }
        async with self._lock:
            self._events.appendleft(event)
            connections = list(self._connections)

        stale: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(event)
            except Exception:
                stale.append(websocket)

        for websocket in stale:
            await self.disconnect(websocket)

    async def websocket_endpoint(self, websocket: WebSocket) -> None:
        await self.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            await self.disconnect(websocket)

    def dashboard_html(self, gate) -> HTMLResponse:
        price_algo = gate.config.price_microalgo / 1_000_000
        html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlgoGate Dashboard</title>
    <style>
      :root {{
        color-scheme: dark;
        --bg: #111316;
        --surface: #1a1d21;
        --border: rgba(255,255,255,0.08);
        --text: #f5f7fa;
        --muted: #93a0ad;
        --accent: #5dcaa5;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        padding: 32px;
        font: 14px/1.5 Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }}
      .wrap {{
        max-width: 1100px;
        margin: 0 auto;
      }}
      .grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-bottom: 18px;
      }}
      .card {{
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px;
      }}
      h1 {{
        margin: 0 0 8px;
        font-size: 28px;
      }}
      .muted {{
        color: var(--muted);
      }}
      code {{
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }}
      table {{
        width: 100%;
        border-collapse: collapse;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 14px;
        overflow: hidden;
      }}
      th, td {{
        padding: 12px 14px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
      }}
      th {{
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }}
      tr:last-child td {{ border-bottom: 0; }}
      .pill {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--accent);
      }}
      .mono {{
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card" style="margin-bottom:16px;">
        <div class="pill">AlgoGate live dashboard</div>
        <h1>{escape(gate.config.api_name)}</h1>
        <p class="muted">Live payment stream for protected FastAPI routes.</p>
      </div>
      <div class="grid">
        <div class="card"><strong>API</strong><div class="muted">{escape(gate.config.api_name)}</div></div>
        <div class="card"><strong>Receiver</strong><div class="mono">{escape(gate.config.receiver)}</div></div>
        <div class="card"><strong>Network</strong><div class="muted">{escape(gate.config.network)}</div></div>
        <div class="card"><strong>Price</strong><div class="muted">{price_algo:g} ALGO per default call</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tx ID</th>
            <th>Route</th>
            <th>Amount</th>
            <th>Time</th>
            <th>Caller IP</th>
            <th>Session</th>
          </tr>
        </thead>
        <tbody id="events-body">
          <tr><td colspan="6" class="muted">Waiting for payments…</td></tr>
        </tbody>
      </table>
    </div>
    <script>
      const body = document.getElementById("events-body");
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(protocol + "://" + location.host + "/algogate/events");

      function renderRows(events) {{
        if (!events.length) {{
          body.innerHTML = '<tr><td colspan="6" class="muted">Waiting for payments…</td></tr>';
          return;
        }}
        body.innerHTML = events.map((event) => `
          <tr>
            <td class="mono">${{event.tx_id}}</td>
            <td class="mono">${{event.route}}</td>
            <td>${{(Number(event.amount) / 1_000_000).toFixed(6)}} ALGO</td>
            <td>${{new Date(event.timestamp).toLocaleString()}}</td>
            <td class="mono">${{event.caller_ip || "-"}}</td>
            <td>${{event.session_issued ? "issued" : "no"}}</td>
          </tr>
        `).join("");
      }}

      const events = [];
      socket.onmessage = (message) => {{
        const payload = JSON.parse(message.data);
        if (payload.type === "history") {{
          events.splice(0, events.length, ...(payload.events || []));
          renderRows(events);
          return;
        }}
        events.unshift(payload);
        renderRows(events);
      }};
    </script>
  </body>
</html>"""
        return HTMLResponse(html)

