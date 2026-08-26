// Shape of event.Records[0].Sns.Message for an SES receipt notification.

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
  content?: string; // base64 raw MIME; absent when the email exceeds ~150KB
}
