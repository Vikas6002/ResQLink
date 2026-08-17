import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';

export type ChannelType = 'emergency' | 'ambulance' | 'hospital' | 'dispatcher';

export function useWebSockets(
  channelType: ChannelType,
  id: number | null | undefined,
  onMessage: (event: any) => void
) {
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback reference updated to prevent socket reinstantiation on callback changes
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) return;

    // Dispatcher doesn't require an ID, others do
    if (channelType !== 'dispatcher' && !id) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_BASE_URL || 'localhost:8000';
    
    let path = `ws/${channelType}/`;
    if (channelType !== 'dispatcher' && id) {
      path += `${id}/`;
    }

    const wsUrl = `${protocol}//${host}/${path}?token=${encodeURIComponent(token)}`;

    let ws: WebSocket | null = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch (err) {
        console.error('Error parsing WS message', err);
      }
    };

    ws.onerror = (err) => {
      console.error(`WebSocket error on ${channelType} channel:`, err);
    };

    ws.onclose = () => {
      console.log(`WebSocket closed for ${channelType} ${id || ''}`);
    };

    return () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      socketRef.current = null;
    };
  }, [channelType, id]);

  const send = (data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not open. Cannot send message:', data);
    }
  };

  return { send };
}
