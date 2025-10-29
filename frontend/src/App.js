import React, { useState, useEffect, useCallback } from 'react';
import './App.css'; // Your improved CSS file

// This is the URL of your Java Spring Boot API server
const API_URL = 'http://localhost:8080';

// Simple debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}


function App() {
  // --- State variables ---
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false); // For styling status message
  const [isLoading, setIsLoading] = useState(false); // For Sending/Deleting/Loading
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [contacts, setContacts] = useState([]); // Loaded from CSV
  const [selectedContacts, setSelectedContacts] = useState(new Set()); // Numbers selected via checkbox
  const [showAddManual, setShowAddManual] = useState(false); // Toggle for manual add form
  const [manualName, setManualName] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [manualError, setManualError] = useState(''); // Error for manual add form
  const [filterText, setFilterText] = useState(''); // State for contact filter
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Debounced Filter Text Update ---
   // eslint-disable-next-line
  const debouncedSetFilterText = useCallback(debounce(setFilterText, 300), []);


  // --- Data Fetching Functions ---
  const fetchHistory = useCallback(() => {
    console.log('Fetching history...');
    setStatus('Fetching history...');
    setStatusIsError(false);
    setIsLoading(true); // Indicate loading during fetch
    fetch(`${API_URL}/get-history`)
      .then(res => {
        if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); }
        return res.json();
      })
      .then(data => {
        console.log('History data received:', data);
        const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) : [];
        setHistory(sortedData);
        // Clear status *only* if it was 'Fetching history...'
        setStatus(prev => prev === 'Fetching history...' ? '' : prev);
      })
      .catch(err => {
        console.error("Error fetching history:", err);
        setStatus('Error: Could not fetch history.');
        setStatusIsError(true);
        setHistory([]);
      })
      .finally(() => {
        setIsLoading(false); // Clear loading indicator
      });
  }, [status]); // Dependency on status might cause re-fetch if status changes, consider removing if problematic

  const fetchDefaultsAndContacts = useCallback(() => {
     console.log('Fetching defaults and contacts...');
     setIsLoading(true); // Indicate loading
     setStatus('Loading initial data...');
     setStatusIsError(false);

     // Fetch default message
     fetch(`${API_URL}/get-defaults`)
      .then(res => {
         if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); }
         return res.json();
      })
      .then(data => {
        console.log('Defaults data received:', data);
        setMessage(data.defaultMessage || '');
      })
      .catch(err => {
        console.error("Error fetching defaults:", err);
        // Don't overwrite contact fetch status if it's already an error
        setStatus(prev => prev.startsWith('Error:') ? prev : 'Error fetching default message.');
        setStatusIsError(true);
      });

     // Fetch contacts
     fetch(`${API_URL}/get-contacts`)
        .then(res => {
            if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); }
            return res.json();
        })
        .then(data => {
            console.log('Contacts data received:', data);
            const sortedContacts = Array.isArray(data) ? data.sort((a, b) => a.name.localeCompare(b.name)) : [];
            setContacts(sortedContacts);
            // Clear loading status only if defaults didn't already set an error
             if (!status.startsWith('Error:')) setStatus('');
        })
        .catch(err => {
            console.error("Error fetching contacts:", err);
            setStatus('Error fetching contacts list.');
            setStatusIsError(true);
            setContacts([]);
        })
        .finally(() => {
            setIsLoading(false);
             // Ensure status isn't stuck on loading if one fails but the other succeeds
            if (status === 'Loading initial data...') setStatus('');
        });
  }, [status]); // Dependency added


  // --- Effect runs once on load ---
  useEffect(() => {
    fetchDefaultsAndContacts(); // Fetch message AND contacts
  }, [fetchDefaultsAndContacts]); // Add function as dependency


  // --- Handle Checkbox Changes ---
  const handleCheckboxChange = (event) => {
    const { value, checked } = event.target;
    setSelectedContacts(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (checked) {
        newSelected.add(value);
      } else {
        newSelected.delete(value);
      }
      console.log('Selected contacts:', newSelected);
      return newSelected;
    });
  };

  // --- Handle Manual Add ---
  const handleAddContact = async () => {
    setManualError('');
    const name = manualName.trim();
    const numberRaw = manualNumber.trim();
    // Validate exactly 10 digits for manual add
    if (!name) {
      setManualError('Name cannot be empty.');
      return;
    }
    if (!numberRaw.match(/^\d{10}$/)) { // Regex for exactly 10 digits
      setManualError('Number must be exactly 10 digits.');
      return;
    }
    const numberExists = contacts.some(c => c.number === numberRaw);
    if (numberExists) {
        setManualError('This number already exists in the list.');
        return;
    }

    const newContact = { name, number: numberRaw }; // Send raw 10 digits
    console.log('Adding new contact:', newContact);
    setIsLoading(true);
    setStatus('Adding contact...');
    setStatusIsError(false);

    try {
      const response = await fetch(`${API_URL}/add-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact)
      });
      const result = await response.json();

      if (response.ok && result.success) {
        console.log('Contact added successfully:', result.contact);
        setContacts(prev => [...prev, result.contact].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedContacts(prev => new Set(prev).add(result.contact.number));
        setManualName('');
        setManualNumber('');
        setShowAddManual(false); // Optionally close manual add form
        setStatus('Contact added successfully!');
         setStatusIsError(false);
      } else {
        console.error('Failed to add contact:', result.message);
        setManualError(`Error: ${result.message || 'Failed to save contact.'}`);
        setStatus('Error adding contact.');
        setStatusIsError(true);
      }
    } catch (error) {
      console.error('Add contact fetch error:', error);
      setManualError('Error: Could not connect to server to add contact.');
      setStatus('Error adding contact.');
      setStatusIsError(true);
    } finally {
        setIsLoading(false);
         setTimeout(() => { // Clear temporary status
            if (status === 'Adding contact...' || status === 'Contact added successfully!' || status === 'Error adding contact.') {
                setStatus('');
            }
         }, 4000);
    }
  };


  // --- Send Message Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('handleSubmit triggered');
    const numbersToSend = Array.from(selectedContacts); // Only send selected contacts

    if (numbersToSend.length === 0) {
      setStatus('Error: Please select at least one contact.');
       setStatusIsError(true);
      return;
    }
    if (!message.trim()) {
      setStatus('Error: Message cannot be empty.');
       setStatusIsError(true);
      return;
    }

    setIsLoading(true);
    setStatus(`Starting send script for ${numbersToSend.length} selected contacts...`);
    setStatusIsError(false);

    try {
      const response = await fetch(`${API_URL}/run-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, numbers: numbersToSend }) // Send Array
      });
      const result = await response.json();
      console.log('Send script response:', result);
      if (response.ok) {
        setStatus(`Success: ${result.message}`);
        setStatusIsError(false);
      } else {
        setStatus(`Error: ${result.message || `Request failed with status ${response.status}`}`);
        setStatusIsError(true);
      }
    } catch (error) {
      console.error('Submit fetch error:', error);
      setStatus('Error: Could not connect to the server during send.');
      setStatusIsError(true);
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
    const numbersToDeleteFor = Array.from(selectedContacts); // Only delete for selected

    if (numbersToDeleteFor.length === 0) {
        setStatus('Error: Please select contacts before deleting.');
        setStatusIsError(true);
        return;
    }
    if (!window.confirm(`Are you sure you want to attempt deleting the last SENT message for the ${numbersToDeleteFor.length} selected contacts? This cannot be undone.`)) {
      console.log('Delete cancelled by user.');
      return;
    }
    setIsDeleting(true);
    setStatus(`Starting delete script for ${numbersToDeleteFor.length} selected contacts...`);
     setStatusIsError(false);
    try {
      const response = await fetch(`${API_URL}/delete-last-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: numbersToDeleteFor }) // Send Array
      });
      const result = await response.json();
      console.log('Delete script response:', result);
      if (response.ok) {
        setStatus(`Success: ${result.message}`);
         setStatusIsError(false);
      } else {
        setStatus(`Error: ${result.message || `Request failed with status ${response.status}`}`);
        setStatusIsError(true);
      }
    } catch (error) {
      console.error('Delete fetch error:', error);
      setStatus('Error: Could not connect to the server during delete.');
      setStatusIsError(true);
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

  // --- Filter Contacts ---
  const filteredContacts = contacts.filter(contact =>
    (contact.name && contact.name.toLowerCase().includes(filterText.toLowerCase())) ||
    (contact.number && contact.number.includes(filterText))
  );

  // --- Helper Functions (keep as is) ---
  const getStatusClass = (statusText) => { /* ... */
    if (!statusText) return '';
    const lowerStatus = statusText.toLowerCase();
    if (lowerStatus.includes('success')) return 'status-success';
    if (lowerStatus.includes('delete')) return 'status-deleted';
    if (lowerStatus.includes('fail') || lowerStatus.includes('error') || lowerStatus.includes('invalid') || lowerStatus.includes('not ready')) return 'status-fail';
    return ''; // Default grey
   };
  const formatTimestamp = (timestampStr) => { /* ... */
      if (!timestampStr) return 'N/A';
      try {
          // Try parsing common formats
          const date = new Date(timestampStr.replace(' ', 'T')); // Try ISO-like
          if (!isNaN(date)) return date.toLocaleString();

          // Add more specific format parsing if needed, e.g., for yyyy-MM-dd HH:mm:ss
          // const parts = timestampStr.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
          // if (parts) {
          //    const dateFromParts = new Date(parts[1], parts[2] - 1, parts[3], parts[4], parts[5], parts[6]);
          //    if (!isNaN(dateFromParts)) return dateFromParts.toLocaleString();
          //}

          return timestampStr; // Return original if parsing fails
      } catch (e) {
          console.error("Error formatting date:", timestampStr, e);
          return timestampStr; // Return original on error
      }
  };


  return (
    <>
      <header className="app-header">
        <i className="fa-brands fa-whatsapp"></i> WhatsApp Bulk Messenger
      </header>

      <main className="container">

        <section className="card form-card">
          <form onSubmit={handleSubmit}>
            <h2><i className="fa-regular fa-paper-plane"></i> Send Message</h2>

            {/* --- Contact Selection Area --- */}
            <div className="form-group">
                <div className="contact-header">
                    <label>Select Contacts ({selectedContacts.size} selected):</label>
                    <div className="contact-controls">
                        <input
                            type="search"
                            placeholder="Filter contacts..."
                            className="contact-filter"
                             // Update filter state directly, use debounced version for actual filtering if performance needed
                            onChange={(e) => setFilterText(e.target.value)}
                            disabled={isLoading || isDeleting}
                        />
                         <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={fetchDefaultsAndContacts} // Re-fetch contacts and message
                            disabled={isLoading || isDeleting}
                            title="Reload contacts from CSV"
                        >
                            <i className="fa-solid fa-sync"></i> Reload
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => { setShowAddManual(prev => !prev); setManualError(''); }} // Toggle and clear error
                            disabled={isLoading || isDeleting}
                            aria-expanded={showAddManual}
                        >
                            <i className={`fa-solid ${showAddManual ? 'fa-minus' : 'fa-plus'}`}></i> Manual Add
                        </button>
                    </div>
                </div>

                {/* --- Manual Add Form (Conditional) --- */}
                {showAddManual && (
                    <div className="manual-add-box">
                         <div className="form-group">
                            <label htmlFor="manual-name">Name:</label>
                            <input
                                type="text"
                                id="manual-name"
                                className="manual-input"
                                value={manualName}
                                onChange={(e) => setManualName(e.target.value)}
                                placeholder="Enter name"
                                disabled={isLoading}
                                required // Basic HTML validation
                            />
                        </div>
                         <div className="form-group">
                            <label htmlFor="manual-number">Number (10 digits):</label>
                            <input
                                type="tel" // Use tel type for numbers
                                id="manual-number"
                                className="manual-input"
                                value={manualNumber}
                                onChange={(e) => setManualNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} // Allow only 10 digits
                                placeholder="Enter 10 digit number"
                                maxLength="10"
                                pattern="\d{10}" // HTML5 validation
                                title="Please enter exactly 10 digits." // Tooltip for pattern
                                disabled={isLoading}
                                required // Basic HTML validation
                            />
                        </div>
                         {manualError && <p className="manual-error">{manualError}</p>}
                         <button
                            type="button"
                            className="btn btn-primary btn-small add-btn"
                            onClick={handleAddContact}
                            // More robust disable check
                            disabled={isLoading || !manualName.trim() || !manualNumber.match(/^\d{10}$/)}
                          >
                             <i className="fa-solid fa-user-plus"></i> Add to List & CSV
                         </button>
                    </div>
                )}

                {/* --- Contact List Checkboxes --- */}
                <div className="contact-list">
                    {contacts.length === 0 && !isLoading ? (
                        <p className="no-contacts-msg">{status.includes('Could not fetch contacts') ? 'Error loading contacts.' : 'No contacts found in contacts.csv.'}</p>
                    ) : (
                        filteredContacts.length === 0 && contacts.length > 0 ? ( // Show only if filtering yielded no results
                            <p className="no-contacts-msg">No contacts match filter.</p>
                        ) : (
                             filteredContacts.map((contact) => (
                                <div key={contact.number} className="contact-item">
                                    <input
                                    type="checkbox"
                                    id={`contact-${contact.number}`}
                                    value={contact.number}
                                    checked={selectedContacts.has(contact.number)}
                                    onChange={handleCheckboxChange}
                                    disabled={isLoading || isDeleting}
                                    />
                                    <label htmlFor={`contact-${contact.number}`}>
                                       {contact.name} <span className="contact-number">({contact.number})</span>
                                    </label>
                                </div>
                             ))
                        )
                    )}
                     {isLoading && contacts.length === 0 && <p className="no-contacts-msg">Loading contacts...</p>}
                </div>
            </div>
            {/* --- END Contact Selection Area --- */}


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
                disabled={isLoading || isDeleting || selectedContacts.size === 0}
              >
                <i className="fa-solid fa-paper-plane"></i>
                {isLoading ? 'Sending...' : `Send to ${selectedContacts.size} Selected`}
              </button>
              {/* Optional: Delete Button. Uncomment if needed */}

              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={handleDelete}
                disabled={isLoading || isDeleting || selectedContacts.size === 0}
              >
                <i className="fa-solid fa-trash-can"></i>
                {isDeleting ? 'Deleting...' : `Delete for ${selectedContacts.size} Selected`}
              </button>

            </div>

            {/* Status Message */}
            {status && (
              <p className={`status-message ${statusIsError ? 'status-error' : 'status-success'}`}>
                {status}
              </p>
            )}
          </form>
        </section>

        {/* --- View/Hide History Button --- */}
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

        {/* --- Collapsible History Panel --- */}
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