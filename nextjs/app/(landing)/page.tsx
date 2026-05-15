export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section id="hero" className="hero-beautiful">
        <div className="hero-bg-grid"></div>
        <div className="container position-relative z-index-2">
          <div className="row justify-content-center text-center">
            <div
              className="col-lg-10 d-flex flex-column justify-content-center align-items-center"
              data-aos="fade-up"
              data-aos-duration="1000"
            >
              <div className="hero-content-frame">
                <h1>
                  Kept<span className="gradient-text">Carbon</span>
                </h1>
                <p className="hero-subtitle-th">
                  แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์{" "}
                  <br className="d-none d-md-block" />
                  เพื่อการจัดการสวนยางพาราอย่างยืดหยุ่นต่อการเปลี่ยนแปลงสภาพภูมิอากาศ
                </p>
                <p className="hero-subtitle-en">
                  A GeoAI-Driven Platform for Climate-Resilient Rubber Plantation Management
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Project About Section */}
      <section id="project-about" className="project-about-section" style={{ scrollMarginTop: 80 }}>
        <div className="container">
          <div className="row justify-content-center text-center mb-5" data-aos="fade-up">
            <div className="col-lg-8 beautiful-section-header">
              <div className="project-tag">
                <i className="bi bi-globe-asia-australia"></i> วิจัยและพัฒนา
              </div>
              <h2>
                เกี่ยวกับ<span>โครงการ</span>
              </h2>
              <div className="title-divider">
                <div className="line"></div>
                <div className="dash"></div>
                <div className="line"></div>
              </div>
            </div>
          </div>

          <div className="row gy-5 align-items-start">
            <div className="col-lg-6" data-aos="fade-right" data-aos-delay="100">
              <p className="project-about-body">
                โครงการวิจัยนี้พัฒนา <strong>KeptCarbon Platform</strong>{" "}
                โดยใช้เทคโนโลยีภูมิสารสนเทศ (Geospatial) ร่วมกับปัญญาประดิษฐ์ (GeoAI)
                เพื่อพยากรณ์อายุยางพาราและประเมินศักยภาพคาร์บอนเครดิตในระดับรายแปลง
                พร้อมนำเสนอข้อมูลเชิงพื้นที่และเวลาในรูปแบบที่เข้าใจง่าย
                ช่วยให้เกษตรกรเห็นภาพรายได้ระยะยาว ลดความเสี่ยงในการตัดสินใจ
                และสนับสนุนการสื่อสารเชิงนโยบายได้อย่างมีประสิทธิภาพ
              </p>
              <p className="project-about-body">
                แพลตฟอร์มนี้ช่วยเพิ่มความแม่นยำของข้อมูล ลดความไม่แน่นอนในการตัดสินใจ
                สร้างแรงจูงใจให้เกษตรกรเข้าร่วมโครงการคาร์บอนเครดิต
                และส่งเสริมผลกระทบเชิงบวกทั้งด้านสิ่งแวดล้อม เศรษฐกิจชุมชน
                และการขับเคลื่อนประเทศสู่เป้าหมาย Net Zero อย่างยั่งยืน
              </p>

              <div className="keptcarbon-meaning-card" data-aos="fade-up" data-aos-delay="200">
                <div className="kc-title">
                  <i className="bi bi-leaf-fill"></i>
                  ความหมายของ KeptCarbon
                </div>
                <p>
                  <strong>KeptCarbon</strong> หมายถึง{" "}
                  <em>&ldquo;การเก็บและรักษาคาร์บอน&rdquo;</em>{" "}
                  สะท้อนแนวคิดการกักเก็บคาร์บอนในสวนยางพารา
                  การรักษามูลค่าทางเศรษฐกิจของคาร์บอนเครดิต
                  และการพัฒนาระบบข้อมูลที่ต่อเนื่องและยั่งยืน
                </p>
              </div>

              <div className="row g-2 mt-4" data-aos="fade-up" data-aos-delay="300">
                <div className="col-4">
                  <div className="stats-box">
                    <div className="stats-icon"><i className="bi bi-list-check"></i></div>
                    <div className="stats-number">3</div>
                    <div className="stats-label">วัตถุประสงค์หลัก</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stats-box">
                    <div className="stats-icon"><i className="bi bi-cpu"></i></div>
                    <div className="stats-number">GeoAI</div>
                    <div className="stats-label">เทคโนโลยีหลัก</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stats-box">
                    <div className="stats-icon"><i className="bi bi-globe-americas"></i></div>
                    <div className="stats-number">Net Zero</div>
                    <div className="stats-label">เป้าหมายสูงสุด</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6" data-aos="fade-left" data-aos-delay="100">
              <h3 className="objectives-title">
                <i className="bi bi-bullseye"></i> วัตถุประสงค์
              </h3>
              <div className="objectives-wrapper">
                <div className="objective-item" data-aos="fade-up" data-aos-delay="150">
                  <div className="obj-indicator"></div>
                  <div className="obj-label">Platform Development</div>
                  <h4 className="obj-heading">พัฒนาและสาธิตระบบ KeptCarbon Platform</h4>
                  <p className="obj-body">
                    ประยุกต์ใช้เทคโนโลยีภูมิสารสนเทศและปัญญาประดิษฐ์
                    เพื่อสร้างฐานข้อมูลสวนยางพารารายแปลง
                    พร้อมฟังก์ชันการพยากรณ์อายุยางพารา การประเมินศักยภาพคาร์บอนเครดิต
                    และการแสดงผลเชิงพื้นที่และเวลา
                    สำหรับสนับสนุนการทำงานของเจ้าหน้าที่และหน่วยงานภาครัฐที่เกี่ยวข้อง
                  </p>
                </div>

                <div className="objective-item" data-aos="fade-up" data-aos-delay="250">
                  <div className="obj-indicator"></div>
                  <div className="obj-label">Policy Decision Support</div>
                  <h4 className="obj-heading">พัฒนาระบบสนับสนุนการตัดสินใจเชิงนโยบาย</h4>
                  <p className="obj-body">
                    ใช้ข้อมูลคาดการณ์คาร์บอนเครดิตและโครงสร้างอายุยางพาราในหลายระดับพื้นที่
                    (รายแปลง–อำเภอ–จังหวัด–ภูมิภาค) เพื่อช่วยผู้กำหนดนโยบายจำลองสถานการณ์
                    วางแผน และบริหารจัดการสวนยางพาราอย่างยั่งยืน
                  </p>
                </div>

                <div className="objective-item" data-aos="fade-up" data-aos-delay="350">
                  <div className="obj-indicator"></div>
                  <div className="obj-label">Training &amp; Capacity Building</div>
                  <h4 className="obj-heading">จัดทำคู่มือและระบบการฝึกอบรม</h4>
                  <p className="obj-body">
                    เสริมศักยภาพการใช้งาน KeptCarbon Platform
                    ให้กับเจ้าหน้าที่ภาครัฐและผู้กำหนดนโยบาย
                    ในการสื่อสารและจูงใจเกษตรกรให้เข้าร่วมโครงการคาร์บอนเครดิตได้อย่างมีประสิทธิภาพ
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="partners-section" data-aos="fade-up" data-aos-delay="400">
            <div className="partners-label">หน่วยงานร่วมโครงการ</div>
            <div className="partners-grid">
              {[1, 2, 3, 4].map((n) => (
                <div className="partner-logo-card" key={n}>
                  <img src={`/assets/img/clients/client-${n}.png`} alt={`Partner ${n}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section id="team" className="team-section" style={{ scrollMarginTop: 80 }}>
        <div className="container">
          <div className="row justify-content-center text-center mb-5" data-aos="fade-up">
            <div className="col-lg-8 beautiful-section-header">
              <div className="project-tag">
                <i className="bi bi-people-fill"></i> คณะผู้ดำเนินงาน
              </div>
              <h2>
                คณะผู้ปฏิบัติงาน<span>โครงการ</span>
              </h2>
              <div className="title-divider">
                <div className="line"></div>
                <div className="dash"></div>
                <div className="line"></div>
              </div>
            </div>
          </div>

          <div className="row gy-5 justify-content-center">
            {[
              {
                img: "team-1.jpg",
                role: "ที่ปรึกษาโครงการ",
                name: "รศ.ดร.สุเพชร จิรขจรกุล",
                desc: "คณะวิทยาศาสตร์และเทคโนโลยี",
                affil: "มหาวิทยาลัยธรรมศาสตร์",
                delay: 100,
              },
              {
                img: "team-2.jpg",
                role: "หัวหน้าโครงการ",
                name: "รศ.ดร.แสงดาว วงค์สาย",
                desc: "คณะวิทยาศาสตร์และเทคโนโลยี",
                affil: "มหาวิทยาลัยธรรมศาสตร์",
                delay: 200,
              },
            ].map((m) => (
              <div className="col-lg-4 col-md-6" data-aos="fade-up" data-aos-delay={m.delay} key={m.img}>
                <div className="team-card">
                  <div className="team-avatar-wrap">
                    <div className="team-avatar-img">
                      <img
                        src={`/assets/img/team/${m.img}`}
                        alt={m.name}
                        className="img-fluid"
                        style={{ objectFit: "cover", objectPosition: "top" }}
                      />
                    </div>
                  </div>
                  <div className="team-card-body">
                    <div className="team-role">{m.role}</div>
                    <div className="team-name">{m.name}</div>
                    <p className="team-desc">
                      {m.desc} <br />
                      {m.affil}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row gy-4 mt-2 justify-content-center">
            {[
              {
                img: "team-3.jpg",
                name: "ผศ.ดร. ชนิดา สุวรรณประสิทธิ์",
                desc: "คณะสังคมศาสตร์",
                affil: "มหาวิทยาลัยเชียงใหม่",
                delay: 300,
              },
              {
                img: "team-4.jpg",
                name: "ดร. นพชัย วงค์สาย",
                desc: "วิทยาลัยศิลปะ สื่อ และเทคโนโลยี",
                affil: "มหาวิทยาลัยเชียงใหม่",
                delay: 400,
              },
              {
                img: "team-5.jpg",
                name: "ดร. ศักดิ์ดา หอมหวล",
                desc: "คณะสังคมศาสตร์",
                affil: "มหาวิทยาลัยเชียงใหม่",
                delay: 500,
              },
            ].map((m) => (
              <div className="col-lg-3 col-md-6" data-aos="fade-up" data-aos-delay={m.delay} key={m.img}>
                <div className="team-card">
                  <div className="team-avatar-wrap">
                    <div className="team-avatar-img">
                      <img src={`/assets/img/team/${m.img}`} alt={m.name} className="img-fluid" />
                    </div>
                  </div>
                  <div className="team-card-body">
                    <div className="team-role">ผู้ร่วมโครงการ</div>
                    <div className="team-name">{m.name}</div>
                    <p className="team-desc">
                      {m.desc} <br />
                      {m.affil}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row gy-4 mt-2 justify-content-center">
            {[
              {
                img: "team-6.jpg",
                name: "รศ.ดร. วีระพงค์ เกิดสิน",
                desc: "คณะเทคโนโลยีและสิ่งแวดล้อม",
                affil: "มหาวิทยาลัยสงขลานครินทร์",
                delay: 600,
              },
              {
                img: "team-7.jpg",
                name: "ดร. จุฑาพร เกษร",
                desc: "คณะเทคโนโลยีและสิ่งแวดล้อม",
                affil: "มหาวิทยาลัยสงขลานครินทร์",
                delay: 700,
              },
            ].map((m) => (
              <div className="col-lg-4 col-md-6" data-aos="fade-up" data-aos-delay={m.delay} key={m.img}>
                <div className="team-card">
                  <div className="team-avatar-wrap">
                    <div className="team-avatar-img">
                      <img src={`/assets/img/team/${m.img}`} alt={m.name} className="img-fluid" />
                    </div>
                  </div>
                  <div className="team-card-body">
                    <div className="team-role">ผู้ร่วมโครงการ</div>
                    <div className="team-name">{m.name}</div>
                    <p className="team-desc">
                      {m.desc} <br />
                      {m.affil}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact"
        className="contact section light-background"
        style={{ padding: "60px 0" }}
      >
        <div
          className="container beautiful-section-header"
          data-aos="fade-up"
          style={{ marginBottom: 32 }}
        >
          <h2>
            ติดต่อ<span>เรา</span>
          </h2>
          <div className="title-divider">
            <div className="line"></div>
            <div className="dash"></div>
            <div className="line"></div>
          </div>
        </div>

        <div className="container" data-aos="fade-up" data-aos-delay="100">
          <div className="row gy-4 align-items-stretch">
            <div className="col-lg-6" data-aos="fade-right" data-aos-delay="150">
              <div className="contact-card">
                <div className="contact-card-icon">
                  <i className="bi bi-building-fill"></i>
                </div>
                <h3>ข้อมูลการติดต่อ</h3>
                <div className="contact-divider"></div>

                <div className="contact-info-row">
                  <i className="bi bi-building"></i>
                  <div>
                    <strong>ที่อยู่มหาวิทยาลัย</strong>
                    สาขาวิชาคณิตศาสตร์และสถิติ คณะวิทยาศาสตร์และเทคโนโลยี
                    <br />
                    มหาวิทยาลัยธรรมศาสตร์ (ศูนย์รังสิต) อ.คลองหลวง จ.ปทุมธานี
                  </div>
                </div>

                <div className="contact-divider"></div>

                <div className="contact-info-row">
                  <i className="bi bi-telephone"></i>
                  <div>
                    <strong>เบอร์โทรศัพท์</strong>
                    (02) 564-4440 – 59 ต่อ 2101 – 3 กด 408
                  </div>
                </div>

                <div className="contact-info-row">
                  <i className="bi bi-envelope-at"></i>
                  <div>
                    <strong>อีเมล</strong>
                    sangdao@mathstat.sci.tu.ac.th
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6" data-aos="fade-left" data-aos-delay="150">
              <div className="contact-card">
                <div className="contact-card-icon">
                  <i className="bi bi-send-fill"></i>
                </div>
                <h3>ส่งข้อความถึงเรา</h3>
                <div className="contact-divider"></div>

                <form className="php-email-form">
                  <div className="contact-form-grid">
                    <div className="contact-form-field">
                      <label>ชื่อ-นามสกุล</label>
                      <input type="text" name="name" placeholder="กรอกชื่อ-นามสกุล" required />
                    </div>
                    <div className="contact-form-field">
                      <label>อีเมล</label>
                      <input type="email" name="email" placeholder="example@email.com" required />
                    </div>
                  </div>

                  <div className="contact-form-field">
                    <label>หัวข้อติดต่อ</label>
                    <input type="text" name="subject" placeholder="ระบุหัวข้อที่ต้องการติดต่อ" required />
                  </div>

                  <div className="contact-form-field">
                    <label>ข้อความถึงเรา</label>
                    <textarea
                      name="message"
                      rows={4}
                      placeholder="เขียนข้อความของคุณที่นี่..."
                      required
                    />
                  </div>

                  <div className="text-center mt-2">
                    <button type="submit" className="contact-submit-btn">
                      <i className="bi bi-send"></i> ส่งข้อความ
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
