#!/usr/bin/env python3
"""Generate the LawDesk ER diagram PDF from the current schema model."""

from __future__ import annotations

import sys
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, HexColor


PAGE_WIDTH = 1920
PAGE_HEIGHT = 1080

COLORS = {
    "background": HexColor("#F6F8FC"),
    "surface": HexColor("#FFFFFF"),
    "ink": HexColor("#172033"),
    "muted": HexColor("#64748B"),
    "line": HexColor("#CBD5E1"),
    "navy": HexColor("#173B57"),
    "blue": HexColor("#2563EB"),
    "blue_soft": HexColor("#E8F0FF"),
    "green": HexColor("#18794E"),
    "green_soft": HexColor("#E3F7EC"),
    "amber": HexColor("#9A6700"),
    "amber_soft": HexColor("#FFF4CC"),
    "purple": HexColor("#7C3AED"),
    "purple_soft": HexColor("#F2EAFE"),
    "coral": HexColor("#C2412D"),
    "coral_soft": HexColor("#FDE9E4"),
    "slate_soft": HexColor("#EEF2F6"),
    "teal": HexColor("#0F766E"),
    "teal_soft": HexColor("#DDF7F4"),
}


def register_fonts() -> None:
    regular_candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
    ]
    bold_candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
    ]

    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)

    if not regular or not bold:
        raise FileNotFoundError("A Unicode TrueType font is required")

    pdfmetrics.registerFont(TTFont("LawDesk", str(regular)))
    pdfmetrics.registerFont(TTFont("LawDesk-Bold", str(bold)))


def table_height(rows: list[tuple], row_height: float = 20) -> float:
    return 46 + len(rows) * row_height + 10


def page_header(
    pdf: canvas.Canvas,
    page_number: int,
    title: str,
    subtitle: str,
) -> None:
    pdf.setFillColor(COLORS["background"])
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    pdf.setFillColor(COLORS["navy"])
    pdf.roundRect(54, 990, 52, 52, 13, stroke=0, fill=1)
    pdf.setFillColor(COLORS["surface"])
    pdf.setFont("LawDesk-Bold", 26)
    pdf.drawCentredString(80, 1006, "L")

    pdf.setFillColor(COLORS["ink"])
    pdf.setFont("LawDesk-Bold", 31)
    pdf.drawString(126, 1012, title)
    pdf.setFillColor(COLORS["muted"])
    pdf.setFont("LawDesk", 14)
    pdf.drawString(128, 986, subtitle)

    pdf.setFillColor(COLORS["surface"])
    pdf.setStrokeColor(COLORS["line"])
    pdf.roundRect(1610, 988, 250, 45, 12, stroke=1, fill=1)
    pdf.setFillColor(COLORS["navy"])
    pdf.setFont("LawDesk-Bold", 12)
    pdf.drawCentredString(1735, 1015, "25 AĞUSTOS 2026")
    pdf.setFillColor(COLORS["muted"])
    pdf.setFont("LawDesk", 9.5)
    pdf.drawCentredString(1735, 999, "PostgreSQL - 17 tablo")

    pdf.setStrokeColor(COLORS["line"])
    pdf.line(54, 970, 1866, 970)

    pdf.setFillColor(COLORS["muted"])
    pdf.setFont("LawDesk", 10.5)
    pdf.drawString(58, 25, "LawDesk - Güncel sade PostgreSQL veri modeli")
    pdf.drawRightString(1862, 25, f"Sayfa {page_number}/3")


def draw_legend(pdf: canvas.Canvas, x: float, y: float) -> None:
    items = [
        ("PK", COLORS["amber_soft"], COLORS["amber"]),
        ("FK", COLORS["blue_soft"], COLORS["blue"]),
        ("Yeni / değişen", COLORS["green_soft"], COLORS["green"]),
        ("Yaşam döngüsü", COLORS["coral_soft"], COLORS["coral"]),
    ]
    cursor = x
    for label, fill, ink in items:
        width = max(47, pdfmetrics.stringWidth(label, "LawDesk-Bold", 9) + 20)
        pdf.setFillColor(fill)
        pdf.roundRect(cursor, y, width, 24, 8, stroke=0, fill=1)
        pdf.setFillColor(ink)
        pdf.setFont("LawDesk-Bold", 9)
        pdf.drawCentredString(cursor + width / 2, y + 7, label)
        cursor += width + 8


def draw_badge(
    pdf: canvas.Canvas,
    label: str,
    x_right: float,
    y: float,
) -> float:
    palettes = {
        "PK": (COLORS["amber_soft"], COLORS["amber"]),
        "FK": (COLORS["blue_soft"], COLORS["blue"]),
        "NN": (COLORS["slate_soft"], COLORS["muted"]),
        "UQ": (COLORS["purple_soft"], COLORS["purple"]),
    }
    fill, ink = palettes.get(label, (COLORS["slate_soft"], COLORS["muted"]))
    width = 29 if len(label) == 2 else 34
    pdf.setFillColor(fill)
    pdf.roundRect(x_right - width, y, width, 14, 4, stroke=0, fill=1)
    pdf.setFillColor(ink)
    pdf.setFont("LawDesk-Bold", 7.2)
    pdf.drawCentredString(x_right - width / 2, y + 4.1, label)
    return x_right - width - 4


def draw_table(
    pdf: canvas.Canvas,
    x: float,
    top: float,
    width: float,
    name: str,
    rows: list[tuple],
    *,
    accent: Color | None = None,
    row_height: float = 20,
    compact: bool = False,
) -> dict[str, float]:
    accent = accent or COLORS["navy"]
    height = table_height(rows, row_height)
    bottom = top - height

    pdf.setFillColor(Color(0.12, 0.18, 0.28, alpha=0.08))
    pdf.roundRect(x + 4, bottom - 4, width, height, 11, stroke=0, fill=1)
    pdf.setFillColor(COLORS["surface"])
    pdf.setStrokeColor(COLORS["line"])
    pdf.setLineWidth(1)
    pdf.roundRect(x, bottom, width, height, 11, stroke=1, fill=1)

    pdf.setFillColor(accent)
    pdf.roundRect(x, top - 46, width, 46, 11, stroke=0, fill=1)
    pdf.rect(x, top - 46, width, 12, stroke=0, fill=1)
    pdf.setFillColor(COLORS["surface"])
    pdf.setFont("LawDesk-Bold", 15 if not compact else 13.5)
    pdf.drawString(x + 14, top - 29, name)
    pdf.setFont("LawDesk", 8.5)
    pdf.drawRightString(x + width - 14, top - 28, f"{len(rows)} alan")

    name_x = x + 14
    type_x = x + width * (0.58 if compact else 0.55)
    y = top - 46

    for index, row in enumerate(rows):
        field, data_type, flags = row[:3]
        highlight = row[3] if len(row) > 3 else None
        row_bottom = y - row_height

        if highlight:
            pdf.setFillColor(COLORS[highlight])
            pdf.rect(x + 1, row_bottom, width - 2, row_height, stroke=0, fill=1)
        elif index % 2 == 1:
            pdf.setFillColor(HexColor("#FAFBFD"))
            pdf.rect(x + 1, row_bottom, width - 2, row_height, stroke=0, fill=1)

        pdf.setStrokeColor(HexColor("#EDF1F5"))
        pdf.line(x + 10, row_bottom, x + width - 10, row_bottom)

        pdf.setFillColor(COLORS["ink"])
        pdf.setFont("LawDesk-Bold" if "PK" in flags else "LawDesk", 9.4 if compact else 10)
        pdf.drawString(name_x, row_bottom + 6.1, field)
        pdf.setFillColor(COLORS["muted"])
        pdf.setFont("LawDesk", 8.6 if compact else 9.1)
        pdf.drawString(type_x, row_bottom + 6.1, data_type)

        badge_x = x + width - 11
        for flag in reversed(flags):
            badge_x = draw_badge(pdf, flag, badge_x, row_bottom + 3)

        y = row_bottom

    return {
        "x": x,
        "top": top,
        "right": x + width,
        "bottom": bottom,
        "width": width,
        "height": height,
        "center_x": x + width / 2,
        "center_y": bottom + height / 2,
    }


def connector(
    pdf: canvas.Canvas,
    points: list[tuple[float, float]],
    label: str,
    *,
    color: Color | None = None,
    dashed: bool = False,
    label_position: tuple[float, float] | None = None,
) -> None:
    color = color or COLORS["blue"]
    pdf.saveState()
    pdf.setStrokeColor(color)
    pdf.setFillColor(color)
    pdf.setLineWidth(2)
    if dashed:
        pdf.setDash(6, 5)

    path = pdf.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    pdf.drawPath(path, stroke=1, fill=0)

    for x, y in (points[0], points[-1]):
        pdf.circle(x, y, 3.5, stroke=0, fill=1)

    label_x, label_y = label_position or points[len(points) // 2]
    label_width = pdfmetrics.stringWidth(label, "LawDesk-Bold", 8.5) + 14
    pdf.setFillColor(COLORS["surface"])
    pdf.setStrokeColor(color)
    pdf.roundRect(label_x - label_width / 2, label_y - 8, label_width, 17, 5, stroke=1, fill=1)
    pdf.setFillColor(color)
    pdf.setFont("LawDesk-Bold", 8.5)
    pdf.drawCentredString(label_x, label_y - 2.5, label)
    pdf.restoreState()


def draw_note(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    title: str,
    lines: list[str],
    *,
    accent: Color,
    fill: Color,
) -> None:
    height = 46 + len(lines) * 20
    pdf.setFillColor(fill)
    pdf.setStrokeColor(accent)
    pdf.setLineWidth(1.2)
    pdf.roundRect(x, y, width, height, 12, stroke=1, fill=1)
    pdf.setFillColor(accent)
    pdf.roundRect(x, y, 7, height, 3, stroke=0, fill=1)
    pdf.setFont("LawDesk-Bold", 13)
    pdf.drawString(x + 22, y + height - 27, title)
    pdf.setFillColor(COLORS["ink"])
    pdf.setFont("LawDesk", 10)
    cursor = y + height - 50
    for line in lines:
        pdf.drawString(x + 24, cursor, f"- {line}")
        cursor -= 20


def access_page(pdf: canvas.Canvas) -> None:
    page_header(
        pdf,
        1,
        "LawDesk ER Diyagramı - Kimlik ve kayıt akışı",
        "Kayıt talebinden tek kullanımlık aktivasyona kadar erişim modeli",
    )
    draw_legend(pdf, 1220, 938)

    request_rows = [
        ("KayitTalepID", "serial", ["PK"], "green_soft"),
        ("AdSoyad", "varchar(150)", ["NN"], "green_soft"),
        ("Email", "varchar(150)", ["NN"], "green_soft"),
        ("Durum", "varchar(20)", ["NN"], "green_soft"),
        ("OlusturmaTarihi", "timestamptz", ["NN"]),
        ("InceleyenKullaniciID", "integer", ["FK"]),
        ("IncelemeTarihi", "timestamptz", []),
        ("RedNedeni", "varchar(500)", []),
        ("OnaylananRol", "varchar(20)", []),
        ("OlusturulanKullaniciID", "integer", ["FK"]),
        ("AktivasyonEposta...", "timestamptz / hata", []),
    ]
    token_rows = [
        ("TokenID", "serial", ["PK"], "green_soft"),
        ("KullaniciID", "integer", ["NN", "FK"], "green_soft"),
        ("KayitTalepID", "integer", ["NN", "FK"], "green_soft"),
        ("TokenHash", "char(64)", ["NN", "UQ"], "teal_soft"),
        ("SonKullanmaTarihi", "timestamptz", ["NN"]),
        ("KullanilmaTarihi", "timestamptz", []),
        ("IptalTarihi", "timestamptz", []),
        ("OlusturanKullaniciID", "integer", ["NN", "FK"]),
    ]
    user_rows = [
        ("KullaniciID", "serial", ["PK"]),
        ("AdSoyad", "varchar(150)", ["NN"]),
        ("Email", "varchar(150)", ["NN", "UQ"]),
        ("SifreHash", "varchar(255)", [], "teal_soft"),
        ("Rol", "varchar(20)", ["NN"]),
        ("AktifMi", "boolean", ["NN"], "green_soft"),
        ("AktivasyonBekliyorMu", "boolean", ["NN"], "green_soft"),
        ("EmailDogrulamaTarihi", "timestamptz", [], "green_soft"),
        ("SilindiMi / SilinmeTarihi", "boolean / timestamp", ["NN"]),
        ("OlusturmaTarihi", "timestamp", ["NN"]),
    ]
    schema_rows = [
        ("MigrationAdi", "varchar(255)", ["PK"], "green_soft"),
        ("Checksum", "char(64)", ["NN"], "green_soft"),
        ("UygulanmaTarihi", "timestamptz", ["NN"], "green_soft"),
    ]
    group_rows = [
        ("GrupID", "serial", ["PK"]),
        ("GrupAdi", "varchar(100)", ["NN", "UQ"]),
        ("Aciklama", "varchar(500)", []),
    ]
    membership_rows = [
        ("GrupUyelikID", "serial", ["PK"]),
        ("GrupID", "integer", ["NN", "FK"]),
        ("KullaniciID", "integer", ["NN", "FK"]),
        ("GrupRolu", "varchar(30)", ["NN"], "green_soft"),
    ]
    notification_rows = [
        ("BildirimID", "serial", ["PK"]),
        ("KullaniciID", "integer", ["NN", "FK"]),
        ("GorevID", "integer", ["FK"]),
        ("KayitTalepID", "integer", ["FK"], "green_soft"),
        ("BildirimTipi", "varchar(30)", ["NN"], "green_soft"),
        ("Mesaj", "varchar(500)", ["NN"]),
        ("OkunduMu / EPosta...", "boolean", ["NN"]),
        ("OlusturmaTarihi", "timestamp", ["NN"]),
    ]
    task_proxy_rows = [
        ("GorevID", "serial", ["PK"]),
        ("Baslik", "varchar(200)", ["NN"]),
    ]

    request_box = draw_table(pdf, 55, 925, 510, "Kayit_Talepleri", request_rows, accent=COLORS["green"])
    token_box = draw_table(pdf, 55, 570, 510, "KullaniciAktivasyonTokenlari", token_rows, accent=COLORS["teal"])
    user_box = draw_table(pdf, 705, 925, 500, "Kullanicilar", user_rows)
    schema_box = draw_table(pdf, 705, 600, 500, "SchemaMigrations", schema_rows, accent=COLORS["green"])
    group_box = draw_table(pdf, 1380, 925, 430, "Gruplar", group_rows)
    membership_box = draw_table(pdf, 1380, 755, 430, "GrupUyelikleri", membership_rows)
    notification_box = draw_table(pdf, 1380, 555, 430, "Bildirimler", notification_rows, accent=COLORS["green"])
    task_box = draw_table(pdf, 1380, 275, 430, "Gorevler (sayfa 2)", task_proxy_rows, compact=True)

    connector(pdf, [(request_box["right"], 770), (user_box["x"], 770)], "inceleyen / oluşan  * : 1")
    connector(pdf, [(token_box["right"], 470), (630, 470), (630, 705), (user_box["x"], 705)], "kullanıcı  * : 1", label_position=(630, 592))
    connector(pdf, [(310, token_box["top"]), (310, request_box["bottom"])], "talep  * : 1", color=COLORS["teal"])
    connector(pdf, [(user_box["right"], 705), (1290, 705), (1290, 680), (membership_box["x"], 680)], "üyelik  1 : *")
    connector(pdf, [(group_box["center_x"], group_box["bottom"]), (group_box["center_x"], membership_box["top"])], "grup  1 : *")
    connector(pdf, [(user_box["right"], 665), (1325, 665), (1325, 480), (notification_box["x"], 480)], "alıcı  1 : *", label_position=(1325, 590))
    connector(pdf, [(request_box["right"], 665), (1260, 665), (1260, 430), (notification_box["x"], 430)], "kayıt bildirimi  1 : *", color=COLORS["green"], label_position=(1260, 535))
    connector(pdf, [(task_box["center_x"], task_box["top"]), (task_box["center_x"], notification_box["bottom"])], "görev  1 : *", dashed=True)

    draw_note(
        pdf,
        705,
        315,
        500,
        "Aktivasyon bütünlüğü",
        [
            "Bekleyen hesap pasiftir ve SifreHash NULL kalır",
            "Tokenın yalnızca SHA-256 özeti veritabanında tutulur",
            "24 saatlik bağlantı tek kullanımdan sonra kapanır",
            "Parola aktivasyonda Argon2id ile üretilir",
        ],
        accent=COLORS["teal"],
        fill=COLORS["teal_soft"],
    )

    pdf.showPage()


def task_page(pdf: canvas.Canvas) -> None:
    page_header(
        pdf,
        2,
        "LawDesk ER Diyagramı - Görev ve yönlendirme modeli",
        "Görev tipi-grup eşleşmesi, alt görev, etiket ve atama geçmişi",
    )
    draw_legend(pdf, 1220, 938)

    type_rows = [
        ("TipID", "serial", ["PK"]),
        ("TipAdi", "varchar(100)", ["NN", "UQ"]),
        ("Aciklama", "varchar(300)", []),
        ("GrupID", "integer", ["NN", "FK"], "green_soft"),
        ("AktifMi", "boolean", ["NN"]),
        ("OlusturanKullaniciID", "integer", ["FK"]),
        ("OlusturmaTarihi", "timestamptz", ["NN"]),
        ("GuncellemeTarihi", "timestamptz", ["NN"]),
        ("ArsivlenmeTarihi", "timestamptz", []),
        ("ArsivleyenKullaniciID", "integer", ["FK"]),
    ]
    group_rows = [
        ("GrupID", "serial", ["PK"]),
        ("GrupAdi", "varchar(100)", ["NN", "UQ"]),
        ("Aciklama", "varchar(500)", []),
    ]
    user_proxy_rows = [
        ("KullaniciID", "serial", ["PK"]),
        ("AdSoyad", "varchar(150)", ["NN"]),
        ("Rol", "varchar(20)", ["NN"]),
        ("AktifMi", "boolean", ["NN"]),
    ]
    task_rows = [
        ("GorevID", "serial", ["PK"]),
        ("UstGorevID", "integer", ["FK"], "green_soft"),
        ("Baslik", "varchar(200)", ["NN"]),
        ("Aciklama", "text", []),
        ("TipID", "integer", ["FK"], "green_soft"),
        ("Oncelik", "varchar(20)", ["NN"]),
        ("Durum", "varchar(30)", ["NN"], "coral_soft"),
        ("IptalNedeni", "varchar(1000)", [], "coral_soft"),
        ("BitisTarihi", "timestamp", []),
        ("TahminiBitisTarihi", "timestamp", []),
        ("TamamlanmaTarihi", "timestamp", []),
        ("SLASuresiSaat", "integer", []),
        ("AtananKullaniciID", "integer", ["FK"]),
        ("AtananGrupID", "integer", ["FK"]),
        ("GorunurlukTipi", "varchar(20)", ["NN"]),
        ("GorunurlukKullaniciID", "integer", ["FK"]),
        ("GorunurlukGrupID", "integer", ["FK"]),
        ("OlusturanKullaniciID", "integer", ["NN", "FK"]),
        ("OlusturmaTarihi", "timestamp", ["NN"]),
        ("GuncellemeTarihi", "timestamp", ["NN"]),
        ("ArsivlendiMi", "boolean", ["NN"], "coral_soft"),
        ("ArsivlenmeTarihi", "timestamp", [], "coral_soft"),
        ("ArsivleyenKullaniciID", "integer", ["FK"], "coral_soft"),
    ]
    tag_rows = [
        ("EtiketID", "serial", ["PK"]),
        ("EtiketAdi", "varchar(50)", ["NN", "UQ"]),
        ("AktifMi", "boolean", ["NN"]),
        ("OlusturanKullaniciID", "integer", ["FK"]),
        ("OlusturmaTarihi", "timestamptz", ["NN"]),
        ("GuncellemeTarihi", "timestamptz", ["NN"]),
        ("ArsivlenmeTarihi", "timestamptz", []),
        ("ArsivleyenKullaniciID", "integer", ["FK"]),
    ]
    task_tag_rows = [
        ("GorevID", "integer", ["PK", "FK"]),
        ("EtiketID", "integer", ["PK", "FK"]),
    ]
    assignment_rows = [
        ("LogID", "serial", ["PK"]),
        ("GorevID", "integer", ["NN", "FK"]),
        ("AtananKullaniciID", "integer", ["FK"]),
        ("AtananGrupID", "integer", ["FK"]),
        ("AtayanKullaniciID", "integer", ["FK"]),
        ("AtamaTarihi", "timestamp", ["NN"]),
    ]
    collaboration_rows = [
        ("Yorumlar", "GorevID", ["FK"]),
        ("Ekler", "GorevID", ["FK"]),
        ("Bildirimler", "GorevID", ["FK"]),
        ("AktiviteLoglari", "GorevID", ["FK"]),
    ]

    type_box = draw_table(pdf, 55, 925, 450, "GorevTipleri", type_rows, accent=COLORS["green"])
    group_box = draw_table(pdf, 55, 620, 450, "Gruplar", group_rows)
    user_box = draw_table(pdf, 55, 440, 450, "Kullanicilar (özet)", user_proxy_rows, compact=True)
    task_box = draw_table(pdf, 625, 925, 680, "Gorevler", task_rows, row_height=20)
    tag_box = draw_table(pdf, 1415, 925, 450, "Etiketler", tag_rows)
    task_tag_box = draw_table(pdf, 1415, 660, 450, "GorevEtiketleri", task_tag_rows, compact=True)
    assignment_box = draw_table(pdf, 1415, 505, 450, "GorevAtamaGecmisi", assignment_rows)
    collaboration_box = draw_table(pdf, 1415, 280, 450, "Göreve bağlı tablolar", collaboration_rows, compact=True)

    connector(pdf, [(group_box["center_x"], group_box["top"]), (group_box["center_x"], type_box["bottom"])], "sorumlu grup  1 : *", color=COLORS["green"])
    connector(pdf, [(type_box["right"], 790), (task_box["x"], 790)], "tip  1 : *", color=COLORS["green"])
    connector(pdf, [(group_box["right"], 545), (565, 545), (565, 585), (task_box["x"], 585)], "atama / görünürlük  1 : *", label_position=(565, 565))
    connector(pdf, [(user_box["right"], 365), (580, 365), (580, 500), (task_box["x"], 500)], "atanan / oluşturan  1 : *", label_position=(580, 430))
    connector(pdf, [(task_box["x"], 875), (580, 875), (580, 835), (task_box["x"], 835)], "üst görev  1 : *", color=COLORS["green"], label_position=(580, 855))
    connector(pdf, [(tag_box["center_x"], tag_box["bottom"]), (tag_box["center_x"], task_tag_box["top"])], "etiket  1 : *")
    connector(pdf, [(task_box["right"], 690), (1365, 690), (1365, 610), (task_tag_box["x"], 610)], "görev  1 : *", label_position=(1365, 650))
    connector(pdf, [(task_box["right"], 520), (1365, 520), (1365, 430), (assignment_box["x"], 430)], "atama geçmişi  1 : *", label_position=(1365, 475))
    connector(pdf, [(task_box["right"], 430), (1340, 430), (1340, 215), (collaboration_box["x"], 215)], "işbirliği  1 : *", dashed=True, label_position=(1340, 325))

    draw_note(
        pdf,
        625,
        100,
        680,
        "Görev yaşam döngüsü kuralları",
        [
            "Tamamlandi ve Iptal Edildi durumları otomatik arşivlenir",
            "Iptal Edildi durumunda IptalNedeni zorunludur",
            "Bir görev aynı anda kişi ve gruba atanamaz",
            "Alt görev, ana görevin atama ve görünürlüğünü devralır",
        ],
        accent=COLORS["coral"],
        fill=COLORS["coral_soft"],
    )

    pdf.showPage()


def collaboration_page(pdf: canvas.Canvas) -> None:
    page_header(
        pdf,
        3,
        "LawDesk ER Diyagramı - İşbirliği ve denetim",
        "Yorum, dosya eki, bildirim, aktivite ve uygulama ayarları",
    )
    draw_legend(pdf, 1220, 938)

    comment_rows = [
        ("YorumID", "serial", ["PK"]),
        ("GorevID", "integer", ["NN", "FK"]),
        ("KullaniciID", "integer", ["NN", "FK"]),
        ("YorumMetni", "text", ["NN"]),
        ("OlusturmaTarihi", "timestamptz", ["NN"]),
        ("GuncellemeTarihi", "timestamptz", []),
        ("DuzenlendiMi", "boolean", ["NN"]),
        ("Versiyon", "integer", ["NN"], "green_soft"),
        ("SilindiMi", "boolean", ["NN"]),
        ("SilinmeTarihi", "timestamptz", []),
        ("SilenKullaniciID", "integer", ["FK"]),
    ]
    history_rows = [
        ("GecmisID", "serial", ["PK"]),
        ("YorumID", "integer", ["NN", "FK"]),
        ("OncekiMetin", "text", ["NN"]),
        ("OncekiVersiyon", "integer", ["NN"], "green_soft"),
        ("DuzenleyenKullaniciID", "integer", ["FK"]),
        ("DegisiklikTarihi", "timestamptz", ["NN"]),
    ]
    attachment_rows = [
        ("EkID", "serial", ["PK"]),
        ("GorevID", "integer", ["NN", "FK"]),
        ("DosyaAdi", "varchar(255)", ["NN"]),
        ("DosyaYolu", "varchar(500)", []),
        ("DosyaVerisi", "bytea", []),
        ("DosyaBoyutuByte", "bigint", ["NN"]),
        ("MimeTuru", "varchar(150)", []),
        ("SifrelemeYontemi", "varchar(50)", []),
        ("YukleyenKullaniciID", "integer", ["NN", "FK"]),
        ("YuklenmeTarihi", "timestamp", ["NN"]),
        ("SilindiMi", "boolean", ["NN"]),
        ("SilinmeTarihi", "timestamp", []),
        ("SilenKullaniciID", "integer", ["FK"]),
    ]
    notification_rows = [
        ("BildirimID", "serial", ["PK"]),
        ("KullaniciID", "integer", ["NN", "FK"]),
        ("GorevID", "integer", ["FK"]),
        ("KayitTalepID", "integer", ["FK"], "green_soft"),
        ("BildirimTipi", "varchar(30)", ["NN"], "green_soft"),
        ("Mesaj", "varchar(500)", ["NN"]),
        ("OkunduMu / EPosta...", "boolean", ["NN"]),
        ("OlusturmaTarihi", "timestamp", ["NN"]),
    ]
    activity_rows = [
        ("LogID", "serial", ["PK"]),
        ("KullaniciID", "integer", ["FK"]),
        ("GorevID", "integer", ["FK"]),
        ("Islem", "varchar(100)", ["NN"]),
        ("Detay", "text", []),
        ("IslemTarihi", "timestamptz", ["NN"]),
    ]
    setting_rows = [
        ("AyarAnahtari", "varchar(100)", ["PK"]),
        ("AyarDegeri", "varchar(500)", ["NN"]),
        ("Aciklama", "varchar(300)", []),
    ]
    proxy_rows = [
        ("Gorevler.GorevID", "iş nesnesi", ["PK"]),
        ("Kullanicilar.KullaniciID", "aktör / alıcı", ["PK"]),
        ("Kayit_Talepleri.KayitTalepID", "kayıt bildirimi", ["PK"]),
    ]

    comment_box = draw_table(pdf, 55, 925, 500, "Yorumlar", comment_rows)
    history_box = draw_table(pdf, 55, 590, 500, "YorumGecmisi", history_rows, accent=COLORS["green"])
    attachment_box = draw_table(pdf, 675, 925, 530, "Ekler", attachment_rows)
    setting_box = draw_table(pdf, 675, 555, 530, "Ayarlar", setting_rows)
    proxy_box = draw_table(pdf, 675, 390, 530, "İlişki hedefleri (özet)", proxy_rows, compact=True)
    notification_box = draw_table(pdf, 1325, 925, 540, "Bildirimler", notification_rows, accent=COLORS["green"])
    activity_box = draw_table(pdf, 1325, 655, 540, "AktiviteLoglari", activity_rows)

    connector(pdf, [(history_box["center_x"], history_box["top"]), (history_box["center_x"], comment_box["bottom"])], "yorum  1 : *", color=COLORS["green"])
    connector(pdf, [(comment_box["right"], 735), (615, 735), (615, 340), (proxy_box["x"], 340)], "görev / kullanıcı  * : 1", label_position=(615, 535))
    connector(
        pdf,
        [
            (attachment_box["right"], 710),
            (1235, 710),
            (1235, 365),
            (proxy_box["right"], 365),
        ],
        "görev / yükleyen  * : 1",
        label_position=(1235, 535),
    )
    connector(pdf, [(notification_box["x"], 785), (1265, 785), (1265, 340), (proxy_box["right"], 340)], "alıcı / görev / talep  * : 1", color=COLORS["green"], label_position=(1265, 565))
    connector(pdf, [(activity_box["x"], 560), (1295, 560), (1295, 305), (proxy_box["right"], 305)], "aktör / görev  * : 1", label_position=(1295, 430))

    draw_note(
        pdf,
        55,
        80,
        570,
        "Kayıt ve parola güvenliği",
        [
            "Her başvuru aynı genel dış yanıtı üretir",
            "Bekleyen e-posta için tek aktif talep bulunur",
            "Aktivasyon tokenı hash olarak ve tek kullanımlık tutulur",
        ],
        accent=COLORS["teal"],
        fill=COLORS["teal_soft"],
    )
    draw_note(
        pdf,
        675,
        80,
        570,
        "Migration ve geliştirme verisi",
        [
            "npm run migrate sıralı ve transaction içinde çalışır",
            "SchemaMigrations dosya adı ve checksum kaydeder",
            "Örnek kullanıcı ve görevler seeds/development.sql içindedir",
        ],
        accent=COLORS["green"],
        fill=COLORS["green_soft"],
    )
    draw_note(
        pdf,
        1295,
        80,
        570,
        "Gerçek PostgreSQL kapsamı",
        [
            "Yorum ve sürüm geçmişi",
            "Dosya yükleme, indirme, arşivleme ve geri yükleme",
            "Etiket, alt görev ve bildirim sahipliği akışları",
        ],
        accent=COLORS["purple"],
        fill=COLORS["purple_soft"],
    )

    pdf.showPage()


def generate(output_path: Path) -> None:
    register_fonts()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(
        str(output_path),
        pagesize=(PAGE_WIDTH, PAGE_HEIGHT),
        pageCompression=1,
    )
    pdf.setTitle("LawDesk ER Diyagramı - 25 Ağustos 2026")
    pdf.setSubject(
        "Güncel PostgreSQL şeması, kayıt aktivasyonu, görev yaşam döngüsü ve migration modeli"
    )
    pdf.setAuthor("LawDesk")
    pdf.setCreator("LawDesk docs/generate_er_diagram.py")

    access_page(pdf)
    task_page(pdf)
    collaboration_page(pdf)
    pdf.save()


if __name__ == "__main__":
    default_output = Path(__file__).with_name("GYS_ER_Diagram.pdf")
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else default_output
    generate(target)
    print(target)
