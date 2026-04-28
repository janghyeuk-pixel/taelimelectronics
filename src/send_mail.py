import os
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from datetime import datetime

SCOPES = ['https://www.googleapis.com/auth/gmail.send']

RECIPIENTS = {
    '한국웨지우드': 'janghyeuk@naver.com',
    '태하무역': 'janghyeuk@nate.com',
    '유연어패럴': 'janghyeuk@kakao.com',
}

def get_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def make_html(company, year_month):
    return f"""<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
  <div style="background:#1a2744;padding:28px 32px;">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="width:48px;height:48px;background:#2d3f6e;border-radius:8px;text-align:center;vertical-align:middle;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">TL</span>
        </td>
        <td style="padding-left:16px;">
          <div style="color:#ffffff;font-size:16px;font-weight:600;">태림전자공업(주)</div>
          <div style="color:#8fa3c8;font-size:12px;margin-top:2px;">Taelim Electronics Industry</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="padding:32px;">
    <div style="font-size:18px;font-weight:600;color:#1a2744;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e8ecf4;">
      {year_month} 세금계산서 발행 안내
    </div>
    <p style="color:#444;font-size:14px;line-height:1.8;margin:0 0 16px;">안녕하세요, <strong>{company}</strong> 담당자님.</p>
    <p style="color:#444;font-size:14px;line-height:1.8;margin:0 0 16px;">
      이번 달 임대료 세금계산서를 발행하였습니다.<br>
      홈택스에서 확인 부탁드립니다.
    </p>
    <p style="color:#444;font-size:14px;line-height:1.8;margin:0;">감사합니다.</p>
  </div>
  <div style="background:#f8f9fc;border-top:1px solid #e8ecf4;padding:20px 32px;">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="width:40px;height:40px;background:#1a2744;border-radius:6px;text-align:center;vertical-align:middle;">
          <span style="color:#fff;font-size:13px;font-weight:700;">TL</span>
        </td>
        <td style="padding-left:16px;">
          <div style="font-size:13px;font-weight:600;color:#1a2744;">장혁 이사</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">태림전자공업(주) · 관리총괄</div>
          <div style="font-size:12px;color:#888;margin-top:2px;">taelimelectronics@gmail.com</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="background:#1a2744;padding:12px 32px;text-align:center;">
    <span style="color:#8fa3c8;font-size:11px;">서울특별시 구로구 구로동 · 태림전자공업(주)</span>
  </div>
</div>
</body>
</html>"""

def send_email(service, company, to):
    year_month = datetime.now().strftime('%Y-%m')
    subject = f'[태림전자공업] {year_month} 세금계산서 발행 안내'
    message = MIMEMultipart('alternative')
    message['to'] = to
    message['subject'] = subject
    message['from'] = '태림전자공업 <taelimelectronics@gmail.com>'
    message.attach(MIMEText(make_html(company, year_month), 'html', 'utf-8'))
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    service.users().messages().send(userId='me', body={'raw': raw}).execute()
    print(f'발송 완료: {company} → {to}')

def main():
    service = get_service()
    for company, email in RECIPIENTS.items():
        send_email(service, company, email)

if __name__ == '__main__':
    main()
    