import { useEffect, useState } from "react";

function App() {
  const [message, setMessage] = useState("Loading...");
  const [dbStatus, setDbStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setError("Backend bağlantısı başarısız"));
  }, []);

  const checkDatabase = async () => {
    setDbStatus("Kontrol ediliyor...");
    try {
      const response = await fetch("/api/db-test");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "DB testi başarısız");
      setDbStatus(data.message);
    } catch (err) {
      setDbStatus(null);
      setError(err.message);
    }
  };

  return (
    <div className="app-container">
      <h1>LawDesk</h1>
      <p>{message}</p>
      {error && <p className="error">{error}</p>}
      <button onClick={checkDatabase}>Veritabanını Test Et</button>
      {dbStatus && <p>{dbStatus}</p>}
    </div>
  );
}

export default App;
