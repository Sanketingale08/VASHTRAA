declare module "socket.io-client" {
  export interface Socket {
    connected: boolean;
    id: string;
    emit(event: string, ...args: any[]): this;
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener?: (...args: any[]) => void): this;
    disconnect(): this;
    close(): this;
  }
  export function io(uri?: string, opts?: any): Socket;
}
