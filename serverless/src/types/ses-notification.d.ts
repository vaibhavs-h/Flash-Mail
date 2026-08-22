// Shape of the JSON body in an SES receipt notification delivered via SNS
// (event.Records[0].Sns.Message), with content-inclusion enabled on the receipt
// rule's SNS action. See AWS's "Examining the Amazon SES email receiving event"
// reference — verify field names there before relying on this at implementation
// time, this is written from that reference, not guessed.

export interface SesMail {
  timestamp: string;
  messageId: string;
  source: string; // SMTP MAIL FROM envelope address
  destination: string[];
  commonHeaders?: {
    from?: string[];
    to?: string[];
    subject?: string;
  };
}

export interface SesReceipt {
  timestamp: string;
  recipients: string[]; // recipients matched by the receipt rule
  action?: {
    type: string;
    topicArn?: string;
  };
}

export interface SesReceiptNotification {
  notificationType: "Received";
  mail: SesMail;
  receipt: SesReceipt;
  // Present only when the receipt rule's SNS action has content-inclusion enabled
  // AND the raw message is under the ~150KB inline-content cap. Base64-encoded raw
  // MIME. Absent for oversized messages — the handler must treat this as "drop and
  // log", not as an error to retry.
  content?: string;
}
