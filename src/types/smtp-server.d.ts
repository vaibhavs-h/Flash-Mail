declare module "smtp-server" {
  import { EventEmitter } from "events";
  import { Readable } from "stream";

  export interface SMTPServerAddress {
    address: string;
    args?: any;
  }

  export interface SMTPServerSession {
    id: string;
    remoteAddress: string;
    clientHostname: string;
    openingCommand: string;
    envelope: {
      mailFrom: false | SMTPServerAddress;
      rcptTo: SMTPServerAddress[];
    };
    [key: string]: any;
  }

  export interface SMTPServerOptions {
    name?: string;
    banner?: string;
    disabledCommands?: string[];
    authOptional?: boolean;
    onRcptTo?: (
      address: SMTPServerAddress,
      session: SMTPServerSession,
      callback: (err?: Error | null) => void
    ) => void;
    onData?: (
      stream: Readable,
      session: SMTPServerSession,
      callback: (err?: Error | null) => void
    ) => void;
    [key: string]: any;
  }

  export class SMTPServer extends EventEmitter {
    constructor(options?: SMTPServerOptions);
    listen(port?: number, host?: string, callback?: () => void): this;
    listen(port?: number, callback?: () => void): this;
    close(callback?: () => void): void;
  }
}
