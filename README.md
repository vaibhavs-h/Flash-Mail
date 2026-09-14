# FLASH-MAIL ✉️

A self-hosted Temporary Email Service. Create disposable email addresses instantly for your temporary needs.

<div align="center">

[View Demo](https://flash-mail.vaibhav.rs) • [Report Bug](https://github.com/vaibhavs-h/Flash-Mail/issues) • [Request Feature](https://github.com/vaibhavs-h/Flash-Mail/issues)

<br />
<br />

![Flash Mail Showcase](./assets/showcase.png)

</div>

## 🌟 Features

- **Instant Setup**: Create temporary email addresses in seconds
- **No Registration**: Zero signup required
- **Self-Hostable**: Run your own instance easily
- **Real-Time Live Sync**: Inbound emails arrive instantly without page refreshing
- **Neubrutalist Interface**: Clean, vibrant, and intuitive user experience

## 📧 Email Receiving

- **Email Format:** `your-username@<random>.vaibhav.rs` — each generated address gets
  its own subdomain, deterministically derived from the username
- Inbound mail is received via AWS SES → SNS → Lambda (see `serverless/`), not a
  self-hosted SMTP server

## 🚀 Quick Start

1. Visit [flash-mail.vaibhav.rs](https://flash-mail.vaibhav.rs)
2. Choose your username
> ⚠️ **Security Note:** Your username is public. Do not use it for confidential communications.
3. Start using your temporary email address as shown on the site

## ⚠️ Limitations

- Attachments are not displayed in the hosted version.
- Email will be removed after 1 hour from the database.

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/feature_name`)
3. Commit your Changes (`git commit -m 'feature_name'`)
4. Push to the Branch (`git push origin feature/feature_name`)
5. Open a Pull Request

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🌟 Show your support

Give a ⭐️ if this project helped you!

## 📞 Contact

Project Link: [https://github.com/vaibhavs-h/Flash-Mail](https://github.com/vaibhavs-h/Flash-Mail)

---

<div align="center">
Made with ❤️ for disposable email privacy
</div>
