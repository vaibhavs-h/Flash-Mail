# FLASH-MAIL ✉️

A self-hosted, real-time Temporary Email Service. Create disposable email addresses instantly for your temporary needs.

<div align="center">

[View Demo](https://flash-mail.vaibhavs-h.xyz) • [Report Bug](https://github.com/vaibhavs-h/Flash-Mail/issues) • [Request Feature](https://github.com/vaibhavs-h/Flash-Mail/issues)

</div>

---

## 🌟 Features

- **Instant Setup**: Create temporary email addresses in seconds
- **No Registration**: Zero signup required
- **Real-Time Live Sync**: Inbound emails arrive instantly via WebSockets without page refreshing
- **Self-Hostable**: Run your own instance easily on Next.js, Vercel & Supabase
- **Neubrutalist UI**: Vibrant, responsive light/dark mode interface with interactive 3D pops and custom color transitions

---

## 📧 SMTP Server Details

- **Server Address:** `flash-mail.vaibhavs-h.xyz`
- **Email Format:** `your-username@flash-mail.vaibhavs-h.xyz`
- All emails sent to `{username}@flash-mail.vaibhavs-h.xyz` are automatically received and processed in real time.

---

## 🚀 Quick Start

1. Visit [flash-mail.vaibhavs-h.xyz](https://flash-mail.vaibhavs-h.xyz)
2. Choose your username
> ⚠️ **Security Note:** Your username is public. Do not use it for confidential communications.
3. Start using your temporary email: `{username}@flash-mail.vaibhavs-h.xyz`

---

## 💻 Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/vaibhavs-h/Flash-Mail.git
   cd "Flash Mail"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase project credentials in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_DOMAIN=flash-mail.vaibhavs-h.xyz
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## ⚠️ Limitations

- Attachments are not displayed in the hosted preview version.
- Emails are automatically purged from the database after 7 days to keep your inbox clean.

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/feature_name`)
3. Commit your Changes (`git commit -m 'feature_name'`)
4. Push to the Branch (`git push origin feature/feature_name`)
5. Open a Pull Request

---

## 🌟 Show your support

Give a ⭐️ if this project helped you!

---

## 📞 Contact

Project Link: [https://github.com/vaibhavs-h/Flash-Mail](https://github.com/vaibhavs-h/Flash-Mail)

<div align="center">

Made with ❤️ for disposable email privacy

</div>
