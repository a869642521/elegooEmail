import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="empty-state" style={{ marginTop: 80 }}>
        这个案例不存在，或者已经被归档。
        <div style={{ marginTop: 18 }}>
          <Link className="primary-button" href="/">
            返回案例库
          </Link>
        </div>
      </div>
    </main>
  );
}
