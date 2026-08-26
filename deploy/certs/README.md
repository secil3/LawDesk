# Veritabanı CA sertifikası

Kurumun ayrı PostgreSQL sunucusu TLS sertifikası kullanıyorsa doğrulayan CA
sertifikasını bu klasöre örneğin `postgresql-ca.pem` adıyla koyun ve
`deploy/production.env` içinde aşağıdaki değeri ayarlayın:

```env
DB_SSL_MODE=verify-full
DB_SSL_CA_PATH=/etc/lawdesk/certs/postgresql-ca.pem
```

Özel anahtarları bu klasöre koymayın. Uygulamanın HTTPS sertifikası kurumun
reverse proxy veya yük dengeleyicisinde yönetilir.
