import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';

export class ChatService {
  private static instance: ChatService;
  private connection: signalR.HubConnection = new signalR.HubConnectionBuilder()
  .withUrl(process.env.NEXT_PUBLIC_BACKEND_API_URL + "/hub", {
    accessTokenFactory: () => this.authToken$.value
  })
  .withAutomaticReconnect()
  .withKeepAliveInterval(5000)
  .configureLogging(signalR.LogLevel.None)
  .build();

  public msgs$ = new BehaviorSubject<any>([]);
  public msgs: { [chatId: string]: string[] } = {};
  public endStream$ = new Subject<void>();
  public selectedModelId$ = new BehaviorSubject<number>(1);
  public HubConnectionState$ = new BehaviorSubject<string>('');
  public userId$ = new BehaviorSubject<string>('');
  public authToken$ = new BehaviorSubject<string>('');

  private constructor() {
    let previousAuthToken = '';
    this.authToken$.subscribe((newAuthToken) => {
      if (newAuthToken !== previousAuthToken) {
        previousAuthToken = newAuthToken;
        this.reconnect();
      }
    });

    // Inside the ChatService class, update the StreamMessage event handler
    this.connection.on("StreamMessage", (message: string) => {
      try {
        const parsedMessage = JSON.parse(message);
        const chatId = parsedMessage.ChatId;
        const partialContent = parsedMessage.PartialContent;

        if (!this.msgs[chatId]) {
          this.msgs[chatId] = [];
        }
        // Add the partialContent to the chatId array
        this.msgs[chatId].push(partialContent);
        this.msgs$.next(this.msgs);
      } catch (error) {
        console.error("Error parsing StreamMessage:", error);
      }
    });
    this.connection.on("EndStream", () => {
      setTimeout(() => {
        this.msgs = {};
        this.msgs$.next(this.msgs);
        this.endStream$.next();
      }, 500); // 1000 milliseconds = 1 seconds
    });
}
public static getInstance(): ChatService {
  if (!ChatService.instance) {
      ChatService.instance = new ChatService();
  }
  return ChatService.instance;
}
public isConnectionConnected(): boolean {
  return this.connection.state === signalR.HubConnectionState.Connected;
}

//start connection
public async start() {
  if (this.connection.state === signalR.HubConnectionState.Disconnected && this.authToken$.value!=null) {
    try {
      await this.connection.start();
      //console.log("SignalR Connected.");
      this.HubConnectionState$.next("Connected");
    } catch (err) {
      console.error("Error starting SignalR connection:", err);
    }
  }
}
//reconnect
public async reconnect(){
  if (this.connection.state === signalR.HubConnectionState.Connected) {
    await this.stop();
  }
    await this.start();
}

//stop connection
public async stop(){
    this.connection.stop();
    this.HubConnectionState$.next("Disconnected"); // Set the HubConnectionState to "Disconnected";
    // console.log("SignalR Disconnected.");
}

}
