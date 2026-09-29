import type { EmailProvider, SendEmailParams } from "../provider";

/**
 * Default provider — no SMTP credentials required. Logs the email to the
 * server console instead of sending it, so password reset (and any future
 * email flows) work out of the box in this local/dev deployment. Set
 * EMAIL_PROVIDER=smtp with SMTP_* env vars to send real email instead.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(params: SendEmailParams): Promise<void> {
    console.log(
      [
        "",
        "========== EMAIL (console provider — not actually sent) ==========",
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        "--------------------------------------------------------------------",
        params.text,
        "====================================================================",
        "",
      ].join("\n"),
    );
  }
}
