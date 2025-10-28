import React, { useState, useEffect } from 'react';
import './App.css'; // Your new CSS file

// This is the URL of your Java Spring Boot API server
const API_URL = 'http://localhost:8080';

function App() {
  // State variables
  const [numbers, setNumbers] = useState(''); // Numbers from textarea
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For Sending
  const [isDeleting, setIsDeleting] = useState(false); // State for Deleting
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false); // History collapsed by default

  // --- Function to fetch history ---
  const fetchHistory = () => {
    console.log('Fetching history...');
    setStatus('Fetching history...'); // Give feedback
    fetch(`${API_URL}/get-history`)
      .then(res => {
        if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); }
        return res.json();
      })
      .then(data => {
        console.log('History data received:', data);
        const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) : [];
        setHistory(sortedData);
        if (status === 'Fetching history...') setStatus('');
      })
      .catch(err => {
        console.error("Error fetching history:", err);
        setStatus('Error: Could not fetch history.');
        setHistory([]);
      });
  };

  // --- Effect to run on load ---
  useEffect(() => {
    console.log('App component mounted. Fetching defaults...');
    fetch(`${API_URL}/get-defaults`)
      .then(res => {
         if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); }
         return res.json();
      })
      .then(data => {
        console.log('Defaults data received:', data);
        setNumbers(data.defaultNumbers || ''); // Use camelCase from Java DTO
        setMessage(data.defaultMessage || ''); // Use camelCase from Java DTO
      })
      .catch(err => {
        console.error("Error fetching defaults:", err);
        setStatus('Error: Could not connect to API server or fetch defaults.');
      });
    // fetchHistory(); // Fetch history on load? Or wait for click?
  }, []);

  // --- Send Message Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('handleSubmit triggered');

    // --- FIX: Validate the raw numbers string ---
    const numbersTrimmed = numbers.trim();
    if (!numbersTrimmed) {
      setStatus('Error: Please enter at least one phone number.');
      return;
    }
    // --- END FIX ---

    if (!message.trim()) {
      setStatus('Error: Message cannot be empty.');
      return;
    }

    setIsLoading(true);
    // Rough count for status message
    const numberCount = numbersTrimmed.split('\n').filter(n => n.trim()).length;
    setStatus(`Starting send script for ${numberCount} numbers...`);

    try {
      const response = await fetch(`${API_URL}/run-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // --- FIX: Send the raw numbers string ---
        body: JSON.stringify({ message: message, numbers: numbersTrimmed })
        // --- END FIX ---
      });

      const result = await response.json();
      console.log('Send script response:', result);
      if (response.ok) {
        setStatus(`Success: ${result.message}`);
      } else {
        setStatus(`Error: ${result.message || `Request failed with status ${response.status}`}`);
      }

    } catch (error) {
      console.error('Submit fetch error:', error);
      setStatus('Error: Could not connect to the server during send.');
    } finally {
      setIsLoading(false);
      console.log('Scheduling history refresh after send...');
      if (showHistory) {
         setTimeout(fetchHistory, 3000);
      }
    }
  };

  // --- Delete Message Handler ---
  const handleDelete = async () => {
    console.log('handleDelete triggered');
    // --- FIX: Validate the raw numbers string ---
    const numbersTrimmed = numbers.trim();
    if (!numbersTrimmed) {
        setStatus('Error: Please enter phone numbers before deleting.');
        return;
    }
    // --- END FIX ---

    if (!window.confirm("Are you sure you want to attempt deleting the last SENT message for everyone in the numbers list? This cannot be undone.")) {
      console.log('Delete cancelled by user.');
      return;
    }

    setIsDeleting(true);
    // Rough count for status message
    const numberCount = numbersTrimmed.split('\n').filter(n => n.trim()).length;
    setStatus(`Starting delete script for ${numberCount} numbers...`);

    try {
      const response = await fetch(`${API_URL}/delete-last-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // --- FIX: Send the raw numbers string ---
        body: JSON.stringify({ numbers: numbersTrimmed })
        // --- END FIX ---
      });

      const result = await response.json();
      console.log('Delete script response:', result);
      if (response.ok) {
        setStatus(`Success: ${result.message}`);
      } else {
        setStatus(`Error: ${result.message || `Request failed with status ${response.status}`}`);
      }

    } catch (error) {
      console.error('Delete fetch error:', error);
      setStatus('Error: Could not connect to the server during delete.');
    } finally {
      setIsDeleting(false);
      console.log('Scheduling history refresh after delete...');
      if (showHistory) {
        setTimeout(fetchHistory, 3000);
      }
    }
  };

  // --- Toggle History Visibility ---
  const toggleHistory = () => {
      const newState = !showHistory;
      setShowHistory(newState);
      if (newState) {
          fetchHistory();
      }
  };

  // Helper function to get status class for badges
  const getStatusClass = (statusText) => {
    if (!statusText) return '';
    const lowerStatus = statusText.toLowerCase();
    if (lowerStatus.includes('success')) {
      return 'status-success';
    }
    if (lowerStatus.includes('delete')) {
        return 'status-deleted';
    }
    if (lowerStatus.includes('fail') || lowerStatus.includes('error') || lowerStatus.includes('invalid') || lowerStatus.includes('not ready')) {
      return 'status-fail';
    }
    return ''; // Default grey
  };

  // Helper to format timestamp string nicely
  const formatTimestamp = (timestampStr) => {
      if (!timestampStr) return 'N/A';
      try {
          const date = new Date(timestampStr.replace(' ', 'T'));
          if (isNaN(date)) return timestampStr;
          return date.toLocaleString();
      } catch (e) {
          console.error("Error formatting date:", timestampStr, e);
          return timestampStr;
      }
  };


  return (
    <>
      <header className="app-header">
        <i className="fa-brands fa-whatsapp"></i> WhatsApp Messenger
      </header>

      <main className="container">

        <section className="card form-card">
          <form onSubmit={handleSubmit}>
            <h2><i className="fa-regular fa-paper-plane"></i> Send New Message</h2>

            <div className="form-group">
              <label htmlFor="phone-numbers">Phone Numbers (one per line)</label>
              <textarea
                id="phone-numbers"
                rows="5"
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder="Enter numbers here, one per line..."
                disabled={isLoading || isDeleting}
              ></textarea>
            </div>

            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                rows="5"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your message here..."
                disabled={isLoading || isDeleting}
              ></textarea>
            </div>

            <div className="button-group">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || isDeleting}
              >
                <i className="fa-solid fa-paper-plane"></i>
                {isLoading ? 'Sending...' : 'Send Messages'}
              </button>
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={handleDelete}
                disabled={isLoading || isDeleting}
              >
                <i className="fa-solid fa-trash-can"></i>
                {isDeleting ? 'Deleting...' : 'Delete Last Message'}
              </button>
            </div>

            {status && (
              <p className={`status-message ${status.toLowerCase().startsWith('error:') ? 'status-error' : 'status-success'}`}>
                {status}
              </p>
            )}
          </form>
        </section>

        <section className="history-toggle-row">
          <button
            className="btn btn-secondary view-history-btn"
            onClick={toggleHistory}
            disabled={isLoading || isDeleting}
            aria-expanded={showHistory}
            aria-controls="history-panel"
          >
            <i className={`fa-solid ${showHistory ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            {showHistory ? 'Hide Send History' : 'View Send History'}
          </button>
        </section>

        <section
          id="history-panel"
          className={`card history-card ${showHistory ? 'expanded' : 'collapsed'}`}
          aria-hidden={!showHistory}
        >
          {showHistory && (
            <>
              <div className="history-header">
                <h2><i className="fa-solid fa-history"></i> Send History</h2>
                <button
                  className="btn btn-secondary"
                  onClick={fetchHistory}
                  disabled={isLoading || isDeleting}
                >
                  <i className="fa-solid fa-rotate-right"></i>
                  Refresh
                </button>
              </div>

              <div className="table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Number</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="no-history">
                            {status.includes('Could not fetch history') ? 'Error loading history.' : 'No history yet.'}
                        </td>
                      </tr>
                    ) : (
                      history.map((entry, index) => (
                        <tr key={index}>
                          <td>{formatTimestamp(entry.timestamp)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{entry.number || 'N/A'}</td>
                          <td>
                            {entry.status && (
                               <span className={`status-badge ${getStatusClass(entry.status)}`}>
                                 {entry.status}
                               </span>
                            )}
                          </td>
                          <td>{entry.message || 'N/A'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

      </main>
    </>
  );
}

export default App;

