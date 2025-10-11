# 📧 Email Configuration Setup Guide

## Current Status
- **Email System**: ✅ Implemented and ready
- **Configuration**: ⚠️ Needs valid credentials
- **Current Error**: Gmail App Password not accepted

---

## 🚀 Quick Fix for Gmail

Your current email configuration:
```
Email: safetracksystems@gmail.com
Issue: App password expired or invalid
```

### Step-by-Step Solution:

#### 1️⃣ Enable 2-Step Verification
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click **"2-Step Verification"**
3. Follow the prompts to enable it (if not already enabled)

#### 2️⃣ Generate New App Password
1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Sign in if prompted
3. Select **"Mail"** from the dropdown
4. Select **"Other (Custom name)"**
5. Enter: **"Smart Vehicle Repairs System"**
6. Click **"Generate"**
7. **IMPORTANT**: Copy the 16-character password (without spaces)
   - Example: `abcd efgh ijkl mnop` → Copy as: `abcdefghijklmnop`

#### 3️⃣ Update Your Configuration
Open your `.env` file and update:

```bash
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=safetracksystems@gmail.com
EMAIL_HOST_PASSWORD=your-new-16-char-password-here
```

#### 4️⃣ Restart Django Server
```bash
# Stop the server (Ctrl+C)
# Then start it again
python3 manage.py runserver
```

#### 5️⃣ Test Email
1. Go to **Admin Panel → Settings → Email**
2. Click **"Send Test Email"**
3. ✅ Should receive email within seconds

---

## 📋 Alternative Email Providers

### Outlook/Hotmail
```bash
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@outlook.com
EMAIL_HOST_PASSWORD=your-password
```

### Yahoo Mail
```bash
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=465
EMAIL_USE_TLS=False
EMAIL_USE_SSL=True
EMAIL_HOST_USER=your-email@yahoo.com
EMAIL_HOST_PASSWORD=your-app-password
```
Note: Yahoo also requires App Password. Generate at [Yahoo App Passwords](https://login.yahoo.com/account/security/app-passwords)

### SendGrid (Recommended for Production)
```bash
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=apikey
EMAIL_HOST_PASSWORD=your-sendgrid-api-key
```
Benefits:
- More reliable delivery
- Better for bulk emails
- Email analytics
- No 2-step verification hassle

Sign up at [SendGrid](https://signup.sendgrid.com/)

---

## 🔍 Common Errors & Solutions

### Error: "Username and Password not accepted"
**Cause**: Using regular Gmail password instead of App Password
**Solution**: Generate App Password (see steps above)

### Error: "Connection refused"
**Cause**: Wrong EMAIL_HOST or EMAIL_PORT
**Solution**: Verify settings match your provider

### Error: "Connection timed out"
**Cause**: Firewall blocking SMTP ports
**Solution**: 
- Check firewall settings
- Try port 465 with SSL instead of 587 with TLS

### Error: "SMTPAuthenticationError"
**Cause**: Invalid credentials
**Solution**: 
- Double-check EMAIL_HOST_USER (full email address)
- Verify App Password is correct
- Ensure no extra spaces in password

### Error: "Email not received"
**Cause**: Email in spam/junk folder
**Solution**: 
- Check spam folder
- Add sender to contacts
- Configure SPF/DKIM records for production

---

## ✅ Verification Checklist

Before testing, ensure:

- [ ] 2-Step Verification enabled on Google Account
- [ ] App Password generated (16 characters)
- [ ] `.env` file updated with new password
- [ ] No spaces in password value
- [ ] EMAIL_HOST_USER is full email address
- [ ] Django server restarted
- [ ] Internet connection working
- [ ] No firewall blocking port 587

---

## 🎯 Test Your Configuration

### Method 1: Via Admin Panel (Recommended)
1. Go to **Admin Panel → Settings**
2. Click **"Email"** category
3. Click **"Send Test Email"** button
4. Check inbox for test email

### Method 2: Via Django Shell
```bash
python3 manage.py shell
```
```python
from django.core.mail import send_mail

send_mail(
    'Test Email',
    'This is a test email from Smart Vehicle Repairs System.',
    'safetracksystems@gmail.com',
    ['your-test-email@gmail.com'],
    fail_silently=False,
)
```

### Method 3: Via Management Command
```bash
python3 manage.py shell -c "from django.core.mail import send_mail; send_mail('Test', 'Test message', 'safetracksystems@gmail.com', ['test@example.com'])"
```

---

## 📱 Production Recommendations

### For Production Use:
1. **Use SendGrid or AWS SES** (more reliable than Gmail)
2. **Set up SPF records** for your domain
3. **Configure DKIM** for email authentication
4. **Monitor email bounces** and delivery rates
5. **Set up email templates** with your branding
6. **Enable email logging** for troubleshooting

### Email Limits:
- **Gmail**: 500 emails/day (not suitable for production)
- **SendGrid Free**: 100 emails/day
- **SendGrid Paid**: Unlimited (pay per email)
- **AWS SES**: Very cheap, highly scalable

---

## 🆘 Still Having Issues?

1. **Check Django logs**: `tail -f logs/django.log`
2. **Check server logs**: `tail -f server.log`
3. **Enable debug mode**: Set `DEBUG=True` temporarily
4. **Test network**: `telnet smtp.gmail.com 587`
5. **Verify credentials**: Try logging into Gmail web interface

---

## 📞 Support Resources

- **Gmail Help**: https://support.google.com/mail
- **App Passwords**: https://support.google.com/accounts/answer/185833
- **SendGrid Docs**: https://docs.sendgrid.com
- **Django Email Docs**: https://docs.djangoproject.com/en/4.2/topics/email/

---

## 🎉 Success Indicators

When properly configured, you should see:
- ✅ Test email received within 30 seconds
- ✅ No errors in console/logs
- ✅ Email appears in inbox (not spam)
- ✅ Sender shows as configured email
- ✅ Notification system working for invoices, appointments, etc.

---

**Last Updated**: October 10, 2025
**Status**: Email system fully implemented, awaiting valid credentials
