import { BehaviorSubject, Subject } from 'rxjs';

export class ChatService {
  private static instance: ChatService;
  private socket: WebSocket | null = null;

  public msgs$ = new BehaviorSubject<any>([]);
  public msgs: { [chatId: string]: string[] } = {};
  public endStream$ = new Subject<void>();
  public selectedModelId$ = new BehaviorSubject<number>(1);
  public HubConnectionState$ = new BehaviorSubject<string>('Disconnected');
  public userId$ = new BehaviorSubject<string>('');
  public authToken$ = new BehaviorSubject<string>('');
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private constructor() {
    let previousAuthToken = '';
    this.authToken$.subscribe((newAuthToken) => {
      if (newAuthToken !== previousAuthToken) {
        previousAuthToken = newAuthToken;
        this.reconnect();
      }
    });
  }
  public static getInstance(): ChatService {
    if (!ChatService.instance) {
        ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }
  private getWebSocketUrl(): string {
    const token = this.authToken$.value;
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || '';
    const wsUrl = baseUrl.replace(/^http(s)?/, 'ws$1');
    return `${wsUrl}/hub?token=${token}`;
  }
  public start(): void {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

      const wsUrl = this.getWebSocketUrl();
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0; // Reset on successful connection
        this.HubConnectionState$.next('Connected');
        console.log('[WebSocket] Connected');
      };

      this.socket.onclose = () => {
        this.HubConnectionState$.next('Disconnected');
        console.log('[WebSocket] Disconnected');
        this.reconnectWithBackoff(); // <-- auto-reconnect
      };

      this.socket.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        this.reconnectWithBackoff(); // <-- also reconnect on error
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const type = message.type;
          const data = message.data;

          if (type === "StreamMessage") {
            const chatId = data.chat_id;
            const partialContent = data.content;

            if (!this.msgs[chatId]) {
              this.msgs[chatId] = [];
            }

            this.msgs[chatId].push(partialContent);
            this.msgs$.next(this.msgs);

          } else if (type === "EndStream") {
            setTimeout(() => {
              this.msgs = {};
              this.msgs$.next(this.msgs);
              this.endStream$.next();
            }, 500);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    }
  public stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.HubConnectionState$.next('Disconnected');
    }
  }

  public reconnect(): void {
    this.stop();
    this.start();
  }
  private reconnectWithBackoff(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached.');
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // 1s, 2s, 4s, 8s...
    console.log(`[WebSocket] Attempting to reconnect in ${delay / 1000}s...`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.start();
    }, delay);
  }

  public isConnectionConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public send(data: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

}
