export default function Footer() {
  return (
    <footer id="footer" className="footer light-background">
      <div className="container">
        <h3 className="sitename">KeptCarbon</h3>
        <p className="text-center">
          แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์
          เพื่อการจัดการสวนยางพาราอย่างยืดหยุ่นต่อการเปลี่ยนแปลงสภาพภูมิอากาศ
        </p>
        <div className="social-links d-flex justify-content-center">
          <a href=""><i className="bi bi-twitter-x"></i></a>
          <a href=""><i className="bi bi-facebook"></i></a>
          <a href=""><i className="bi bi-instagram"></i></a>
          <a href=""><i className="bi bi-line"></i></a>
        </div>
        <div className="copyright">
          <span>สงวนลิขสิทธิ์ &copy;</span>{" "}
          <strong className="px-1 sitename">KeptCarbon</strong>
        </div>
        <div className="credits">
          Designed by <a href="https://engrids.soc.cmu.ac.th/">EnGRIDs</a>
        </div>
      </div>
    </footer>
  );
}
