// Edge function: moderate-user
//
// Manually called (via curl or future admin dashboard) to apply a moderation
// action to a user. Requires a service-role Authorization header.
//
// POST body:
//   {
//     user_id:   string (uuid)        — user being moderated
//     action:    string               — one of the ACTIONS below
//     reason:    string               — explanation (substituted into email)
//     report_id: string? (uuid)       — optional, to resolve an associated report
//   }
//
// Actions: warning | content_removed | temp_ban_24h | temp_ban_7d | temp_ban_30d | permanent_ban
//
// Email HTML is embedded directly (Resend's /emails API does not support
// template_id references — verified 2026-05-01). The HTML below was
// designed in Resend and pasted here. Variables ({{ .Reason }} etc.) are
// substituted server-side before sending.
//
// Deploy: supabase functions deploy moderate-user

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const FROM = "Wanna <noreply@send.joinwannaapp.com>";

const VALID_ACTIONS = [
  "warning",
  "content_removed",
  "temp_ban_24h",
  "temp_ban_7d",
  "temp_ban_30d",
  "permanent_ban",
] as const;

type Action = (typeof VALID_ACTIONS)[number];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BAN_DURATIONS: Partial<Record<Action, number>> = {
  temp_ban_24h: 24 * 60 * 60 * 1000,
  temp_ban_7d:  7  * 24 * 60 * 60 * 1000,
  temp_ban_30d: 30 * 24 * 60 * 60 * 1000,
};

const BAN_DURATION_LABELS: Partial<Record<Action, string>> = {
  temp_ban_24h: "24 hours",
  temp_ban_7d:  "7 days",
  temp_ban_30d: "30 days",
};

const REPORT_RESOLUTION: Partial<Record<Action, string>> = {
  warning:         "warning",
  content_removed: "content_removed",
  temp_ban_24h:    "temp_ban",
  temp_ban_7d:     "temp_ban",
  temp_ban_30d:    "temp_ban",
  permanent_ban:   "permanent_ban",
};

// Subject lines per template (per user's email-design spec)
const SUBJECTS = {
  warning:         "A reminder about Wanna's community guidelines",
  content_removed: "An update on your Wanna account",
  temp_ban:        "Your Wanna account has been temporarily suspended",
  permanent_ban:   "Your Wanna account has been closed",
} as const;

// =============================================================================
// HTML templates (designed in Resend, pasted here verbatim).
// Placeholder syntax: {{ .Reason }} {{ .BanDuration }} {{ .BannedUntil }} {{ .ContentType }}
// =============================================================================

const HTML_WARNING = `<div
  data="[object Object]"
  data-type="globalContent"
  style="width: 100%; height: 1px; visibility: hidden; background-color: transparent;"
></div>
<div data-type="container" class="node-container">
  <table style="background-color:#F5F5F7;" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tbody>
      <tr style="">
        <td style="padding:40px 20px;" alignment="center" align="center">
          <table
            style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;"
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="600"
          >
            <tbody>
              <tr style="">
                <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">
                  <p class="node-paragraph" style="">&nbsp;</p>
                </td>
              </tr>
              <tr style="">
                <td style="padding:36px 40px 0 40px;" alignment="center" align="center">
                  <p class="node-paragraph" style="">
                    <span style="color: #8C52FF"
                      ><span
                        style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;"
                        >wanna</span
                      ></span
                    >
                  </p>
                </td>
              </tr>
              <tr style="">
                <td style="padding:32px 40px 12px 40px;">
                  <h1
                    style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;"
                  >
                    You've received a warning
                  </h1>
                  <p
                    class="node-paragraph"
                    style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                  >
                    We reviewed your account and found activity that doesn't align with our community guidelines.
                  </p>
                </td>
              </tr>
              <tr style="">
                <td style="padding:0 40px 24px 40px;">
                  <table style="" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tbody>
                      <tr style="">
                        <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                          <p
                            class="node-paragraph"
                            style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                          >
                            Reason
                          </p>
                          <p
                            class="node-paragraph"
                            style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                          >
                            {{ .Reason }}
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr style="">
                <td style="padding:0 40px 24px 40px;">
                  <p
                    class="node-paragraph"
                    style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                  >
                    No action has been taken on your account at this time. This is a reminder to review our guidelines
                    and make sure your activity on wanna is respectful and safe.
                  </p>
                </td>
              </tr>
              <tr style="">
                <td style="padding:0 40px 32px 40px;">
                  <p
                    class="node-paragraph"
                    style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#B0B0B8;"
                  >
                    Continued violations may result in content removal or suspension of your account.
                  </p>
                </td>
              </tr>
              <tr style="">
                <td style="padding:0 40px;">
                  <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;" class="" />
                </td>
              </tr>
              <tr style="">
                <td style="padding:24px 40px 12px 40px;">
                  <p
                    class="node-paragraph"
                    style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;"
                    alignment="center"
                  >
                    If you believe this was a mistake, reach out to us at
                    <a
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      class="node-link"
                      style="color: #8C52FF; text-decoration: underline"
                      href="mailto:hello@joinwannaapp.com"
                      ><u>hello@joinwannaapp.com</u></a
                    >.
                  </p>
                </td>
              </tr>
              <tr style="">
                <td style="padding:0 40px 32px 40px;">
                  <p
                    class="node-paragraph"
                    style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;"
                    alignment="center"
                  >
                    This is an automated message — please do not reply to this email.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <p class="node-paragraph" style=""></p>
</div>`;

const HTML_CONTENT_REMOVED = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content removed – wanna</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F5F7;-webkit-font-smoothing:antialiased;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background-color:#F5F5F7;"
    >
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table
            role="presentation"
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;"
          >
            <!-- Amber accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">
                &nbsp;
              </td>
            </tr>

            <!-- Wordmark -->
            <tr>
              <td align="center" style="padding:36px 40px 0 40px;">
                <span
                  style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;"
                  >wanna</span
                >
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 12px 40px;">
                <h1
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;"
                >
                  Content removed from your account
                </h1>
                <p
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  We reviewed your account and removed content that violates our community guidelines.
                </p>
              </td>
            </tr>

            <!-- Details box -->
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                      <p
                        style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                      >
                        Reason
                      </p>
                      <p
                        style="margin:0 0 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                      >
                        {{ .Reason }}
                      </p>
                      <p
                        style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                      >
                        Content type
                      </p>
                      <p
                        style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                      >
                        {{ .ContentType }}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 24px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  Your account is still active. Please review our guidelines to avoid further action.
                </p>
              </td>
            </tr>

            <!-- Escalation notice -->
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#B0B0B8;"
                >
                  Repeated violations may result in a temporary or permanent suspension of your account.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px;">
                <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;" />
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px 12px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;"
                >
                  If you believe this was a mistake, reach out to us at
                  <a href="mailto:support@joinwannaapp.com" style="color:#8C52FF;text-decoration:underline;"
                    >support@joinwannaapp.com</a
                  >.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;"
                >
                  This is an automated message — please do not reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </body>
</html>`;

const HTML_TEMP_BAN = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Account suspended – wanna</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F5F7;-webkit-font-smoothing:antialiased;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background-color:#F5F5F7;"
    >
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table
            role="presentation"
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;"
          >
            <!-- Red accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">
                &nbsp;
              </td>
            </tr>

            <!-- Wordmark -->
            <tr>
              <td align="center" style="padding:36px 40px 0 40px;">
                <span
                  style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;"
                  >wanna</span
                >
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 12px 40px;">
                <h1
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;"
                >
                  Your account has been temporarily suspended
                </h1>
                <p
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  After reviewing your account, we've found activity that violates our community guidelines. Your
                  account has been suspended and you won't be able to use <strong>wanna</strong> during this time.
                </p>
              </td>
            </tr>

            <!-- Details box -->
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding:0 0 12px 0;">
                            <p
                              style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                            >
                              Reason
                            </p>
                            <p
                              style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                            >
                              {{ .Reason }}
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 0 12px 0;">
                            <p
                              style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                            >
                              Duration
                            </p>
                            <p
                              style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                            >
                              {{ .BanDuration }}
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0;">
                            <p
                              style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                            >
                              Access restored
                            </p>
                            <p
                              style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                            >
                              {{ .BannedUntil }}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 24px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  Your account will be automatically reactivated on the date above. Further violations may lead to a
                  longer suspension or a permanent ban.
                </p>
              </td>
            </tr>

            <!-- What to know -->
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                      <p
                        style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                      >
                        While suspended
                      </p>
                      <p
                        style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                      >
                        You can't log in, post activities, send messages, or appear in other users' feeds. Your existing
                        profile and matches will be preserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px;">
                <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;" />
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px 12px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;"
                >
                  If you believe this was a mistake, reach out to us at
                  <a href="mailto:support@joinwannaapp.com" style="color:#8C52FF;text-decoration:underline;"
                    >support@joinwannaapp.com</a
                  >.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;"
                >
                  This is an automated message — please do not reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </body>
</html>`;

const HTML_PERM_BAN = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Account permanently suspended – wanna</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F5F7;-webkit-font-smoothing:antialiased;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background-color:#F5F5F7;"
    >
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table
            role="presentation"
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;"
          >
            <!-- Dark red accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#8C52FF,#57B8D0);font-size:0;line-height:0;">
                &nbsp;
              </td>
            </tr>

            <!-- Wordmark -->
            <tr>
              <td align="center" style="padding:36px 40px 0 40px;">
                <span
                  style="font-family:'VAG Rounded Next Bold','Nunito',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#8C52FF;letter-spacing:1px;"
                  >wanna</span
                >
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 12px 40px;">
                <h1
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#2D2D3A;"
                >
                  Your account has been permanently suspended
                </h1>
                <p
                  style="margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  After a thorough review, we've determined that your activity on <strong>wanna</strong> seriously
                  violates our community guidelines. Your account has been permanently suspended.
                </p>
              </td>
            </tr>

            <!-- Reason box -->
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:#F5F5F7;border-radius:12px;padding:16px 20px;">
                      <p
                        style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#2D2D3A;text-transform:uppercase;letter-spacing:0.5px;"
                      >
                        Reason
                      </p>
                      <p
                        style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#2D2D3A;"
                      >
                        {{ .Reason }}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#2D2D3A;"
                >
                  What this means
                </p>
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#2D2D3A;"
                >
                  You can no longer access your account, and your profile has been removed from
                  <strong>wanna.</strong> This decision is final.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px;">
                <hr style="border:none;border-top:1px solid #F5F5F7;margin:0;" />
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px 12px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#B0B0B8;text-align:center;"
                >
                  If you believe this was made in error, you may contact us at
                  <a href="mailto:support@joinwannaapp.com" style="color:#8C52FF;text-decoration:underline;"
                    >support@joinwannaapp.com</a
                  >.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p
                  style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#B0B0B8;text-align:center;"
                >
                  This is an automated message — please do not reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </body>
</html>`;

// =============================================================================
// Helpers
// =============================================================================
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    // Match {{ .Name }} with optional whitespace
    const pattern = new RegExp(`\\{\\{\\s*\\.${k}\\s*\\}\\}`, "g");
    out = out.replace(pattern, escapeHtml(v));
  }
  return out;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<string | null> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<mailto:hello@joinwannaapp.com?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `Resend HTTP ${res.status}`);
  return body?.id ?? null;
}

// =============================================================================
// Main handler
// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer /, "");
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: { user_id: string; action: string; reason: string; report_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  const { user_id, action, reason, report_id } = body;
  if (!user_id || !action || !reason) {
    return jsonResponse({ error: "user_id, action, and reason are required" }, 400);
  }
  if (!VALID_ACTIONS.includes(action as Action)) {
    return jsonResponse(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      400
    );
  }
  const moderationAction = action as Action;

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const [profileResult, authResult] = await Promise.all([
    adminClient.from("profiles").select("first_name, is_active, is_seed").eq("id", user_id).maybeSingle(),
    adminClient.auth.admin.getUserById(user_id),
  ]);

  const profile = profileResult.data;
  if (!profile) return jsonResponse({ error: "user not found" }, 404);

  const userEmail = authResult.data?.user?.email;
  if (!userEmail) return jsonResponse({ error: "user has no email address" }, 400);

  // Optionally fetch the linked report (used for content_type substitution)
  let reportContentType: string | null = null;
  if (report_id) {
    const { data: report } = await adminClient
      .from("reports")
      .select("content_type")
      .eq("id", report_id)
      .maybeSingle();
    reportContentType = report?.content_type ?? null;
  }

  // Apply profile changes
  const profileUpdates: Record<string, unknown> = {};
  let bannedUntilDate: Date | null = null;

  if (moderationAction in BAN_DURATIONS) {
    const durationMs = BAN_DURATIONS[moderationAction]!;
    bannedUntilDate = new Date(Date.now() + durationMs);
    profileUpdates.is_active = false;
    profileUpdates.banned_until = bannedUntilDate.toISOString();
    profileUpdates.ban_reason = reason;
  } else if (moderationAction === "permanent_ban") {
    profileUpdates.is_active = false;
    profileUpdates.banned_until = null;
    profileUpdates.ban_reason = reason;
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error: updateErr } = await adminClient
      .from("profiles")
      .update(profileUpdates)
      .eq("id", user_id);
    if (updateErr) {
      console.error("Profile update failed:", updateErr.message);
      return jsonResponse(
        { error: "failed to update profile", detail: updateErr.message },
        500
      );
    }
  }

  // Resolve linked report
  if (report_id && REPORT_RESOLUTION[moderationAction]) {
    const { error: reportErr } = await adminClient
      .from("reports")
      .update({
        status: "resolved",
        resolution: REPORT_RESOLUTION[moderationAction],
        resolved_at: new Date().toISOString(),
      })
      .eq("id", report_id);
    if (reportErr) {
      console.warn("Report update failed (non-fatal):", reportErr.message);
    }
  }

  // Pick template + render variables
  let subject: string;
  let html: string;

  switch (moderationAction) {
    case "warning":
      subject = SUBJECTS.warning;
      html = render(HTML_WARNING, { Reason: reason });
      break;
    case "content_removed":
      subject = SUBJECTS.content_removed;
      html = render(HTML_CONTENT_REMOVED, {
        Reason: reason,
        ContentType: reportContentType ?? "Content",
      });
      break;
    case "temp_ban_24h":
    case "temp_ban_7d":
    case "temp_ban_30d":
      subject = SUBJECTS.temp_ban;
      html = render(HTML_TEMP_BAN, {
        Reason: reason,
        BanDuration: BAN_DURATION_LABELS[moderationAction]!,
        BannedUntil: bannedUntilDate!.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "America/Los_Angeles",
        }),
      });
      break;
    case "permanent_ban":
      subject = SUBJECTS.permanent_ban;
      html = render(HTML_PERM_BAN, { Reason: reason });
      break;
  }

  let messageId: string | null = null;
  try {
    messageId = await sendEmail(userEmail, subject!, html!);
    console.log("Moderation email sent:", messageId, "action:", moderationAction, "user:", user_id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Email send failed:", msg);
    return jsonResponse({
      status: "partial",
      warning: "profile updated but email failed",
      email_error: msg,
      action: moderationAction,
    }, 207);
  }

  return jsonResponse({
    status: "ok",
    action: moderationAction,
    user_id,
    message_id: messageId,
    banned_until: bannedUntilDate?.toISOString() ?? null,
    subject: subject!,
  });
});
