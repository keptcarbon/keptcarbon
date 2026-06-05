"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "success" | "error";

export default function ContactForm() {
  const [recipient, setRecipient] = useState<"keptcarbon" | "engrids">("keptcarbon");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      recipient,
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      subject: (form.elements.namedItem("subject") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ส่งไม่สำเร็จ");
      setStatus("success");
      form.reset();
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="contact-card">
      <div className="contact-card-icon">
        <i className="bi bi-send-fill"></i>
      </div>
      <h3>ส่งข้อความถึงเรา</h3>
      <div className="contact-divider"></div>

      {/* Recipient selector */}
      <div className="contact-recipient-row">
        <label className="contact-recipient-label" htmlFor="contact-recipient">
          <i className="bi bi-person-lines-fill"></i> ส่งถึง
        </label>
        <select
          id="contact-recipient"
          className="contact-recipient-select"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value as "keptcarbon" | "engrids")}
        >
          <option value="keptcarbon">โครงการวิจัย KeptCarbon</option>
          <option value="engrids">ผู้พัฒนาระบบ EnGRIDs</option>
        </select>
      </div>

      <div className="contact-divider"></div>

      <form onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-md-6">
            <div className="contact-form-field">
              <label>ชื่อ-นามสกุล</label>
              <input type="text" name="name" placeholder="กรอกชื่อ-นามสกุล" required />
            </div>
          </div>
          <div className="col-md-6">
            <div className="contact-form-field">
              <label>อีเมล</label>
              <input type="email" name="email" placeholder="example@email.com" required />
            </div>
          </div>
          <div className="col-12">
            <div className="contact-form-field">
              <label>หัวข้อติดต่อ</label>
              <input type="text" name="subject" placeholder="ระบุหัวข้อที่ต้องการติดต่อ" required />
            </div>
          </div>
          <div className="col-12">
            <div className="contact-form-field">
              <label>ข้อความถึงเรา</label>
              <textarea
                name="message"
                rows={4}
                placeholder="เขียนข้อความของคุณที่นี่..."
                required
              />
            </div>
          </div>
          <div className="col-12 text-center">
            {status === "success" ? (
              <div className="contact-success-msg">
                <i className="bi bi-check-circle-fill"></i> ส่งข้อความสำเร็จแล้ว!
              </div>
            ) : (
              <>
                {status === "error" && (
                  <div className="contact-error-msg">
                    <i className="bi bi-exclamation-circle-fill"></i> {errorMsg}
                  </div>
                )}
                <button
                  type="submit"
                  className="contact-submit-btn"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? (
                    <><i className="bi bi-hourglass-split"></i> กำลังส่ง...</>
                  ) : (
                    <><i className="bi bi-send"></i> ส่งข้อความ</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
