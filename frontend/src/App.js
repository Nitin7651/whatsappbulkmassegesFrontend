import React, { useState, useEffect, useCallback } from 'react';
import './App.css'; // Your CSS file is imported here

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
  const [statusIsError, setStatusIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // General loading
  const [isSending, setIsSending] = useState(false); // Specific for send
  const [isDeleting, setIsDeleting] = useState(false); // <-- FIXED: Added missing state
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [contacts, setContacts] = useState([]); // Loaded from DB
  const [selectedContacts, setSelectedContacts] = useState(new Set()); // Selected numbers
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [manualError, setManualError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadIsError, setUploadIsError] = useState(false);

  // eslint-disable-next-line
  const debouncedSetFilterText = useCallback(debounce(setFilterText, 300), []);

  // --- Data Fetching Functions ---
  const fetchHistory = useCallback(() => {
    console.log('Fetching history...');
    setStatus('Fetching history...');
    setStatusIsError(false);
    setIsLoading(true);
    fetch(`${API_URL}/get-history`)
      .then(res => {
        if (!res.ok) { throw new Error(`HTTP error! status: ${res.status}`); }
        return res.json();
      })
      .then(data => {
        console.log('History data received:', data);
        const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) : [];
        setHistory(sortedData);
        setStatus(prev => prev === 'Fetching history...' ? '' : prev);
      })
      .catch(err => {
        console.error("Error fetching history:", err);
        setStatus('Error: Could not fetch history.');
        setStatusIsError(true);
        setHistory([]);
      })
      .finally(() => setIsLoading(false));
  }, []); // FIXED: Removed 'status' dependency

  // --- *** FIXED: Added the missing function definition *** ---
  const fetchDefaultsAndContacts = useCallback((isReload = false) => {
     console.log(isReload ? 'Reloading data...' : 'Fetching initial data...');
     setIsLoading(true);
     if (isReload) {
         setStatus('Reloading contacts...');
     } else {
         setStatus('Loading initial data...');
     }
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
            if (isReload) setStatus('Contacts reloaded successfully!');
            else setStatus(prev => prev === 'Loading initial data...' ? '' : prev);
        })
        .catch(err => {
            console.error("Error fetching contacts:", err);
            setStatus('Error fetching contacts list.');
            setStatusIsError(true);
            setContacts([]);
        })
        .finally(() => {
            setIsLoading(false);
            if (isReload) {
                setTimeout(() => {
                    setStatus(prev => prev === 'Contacts reloaded successfully!' ? '' : prev);
                }, 3000);
            }
        });
  }, []); // FIXED: Removed 'status' dependency
  // --- *** END OF MISSING FUNCTION *** ---


  // --- Effect runs once on load ---
  useEffect(() => {
    fetchDefaultsAndContacts(false); // Initial load
  }, [fetchDefaultsAndContacts]);


  // --- Handle Checkbox Changes ---
  const handleCheckboxChange = (event) => {
    const { value, checked } = event.target;
    setSelectedContacts(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (checked) newSelected.add(value);
      else newSelected.delete(value);
      return newSelected;
    });
  };

  // --- Handle Manual Add ---
  const handleAddContact = async () => {
    setManualError('');
    const name = manualName.trim();
    const numberRaw = manualNumber.trim();
    
    if (!name) {
      setManualError('Name cannot be empty.');
      return;
    }
    if (!numberRaw.match(/^\d{10}$/)) {
      setManualError('Number must be exactly 10 digits.');
      return;
    }
    const numberExists = contacts.some(c => c.number === numberRaw);
    if (numberExists) {
        setManualError('This number already exists in the list.');
        return;
    }

    const newContact = { name, number: numberRaw };
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
        setShowAddManual(false);
        setStatus('Contact added successfully!');
        setStatusIsError(false);
      } else {
        console.error('Failed to add contact:', result.message);
        setManualError(`Error: ${result.message || 'Failed to save contact.'}`);
        setStatus('');
      }
    } catch (error) {
      console.error('Add contact fetch error:', error);
      setManualError('Error: Could not connect to server.');
      setStatus('');
    } finally {
        setIsLoading(false);
         setTimeout(() => {
            if (status === 'Adding contact...' || status === 'Contact added successfully!') {
                setStatus('');
            }
         }, 4000);
    }
  };

  // --- Handle File Upload ---
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv") ||
                 file.type === "application/vnd.ms-excel" || file.name.endsWith(".xls") ||
                 file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.name.endsWith(".xlsx"))) {
      setSelectedFile(file);
      setUploadStatus(`File selected: ${file.name}`);
      setUploadIsError(false);
    } else {
      setSelectedFile(null);
      setUploadStatus("Invalid file type. Please select a CSV or Excel file.");
      setUploadIsError(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
        setUploadStatus("Please select a file to upload first.");
        setUploadIsError(true);
        return;
    }
    setIsLoading(true);
    setUploadStatus(`Uploading ${selectedFile.name}...`);
    setUploadIsError(false);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch(`${API_URL}/upload-contacts`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok && result.success) {
            setUploadStatus(result.message);
            setUploadIsError(false);
            setSelectedFile(null);
            if(document.getElementById('file-upload-input')) {
              document.getElementById('file-upload-input').value = null;
            }
            fetchDefaultsAndContacts(true); // Pass true for reload
        } else {
            setUploadStatus(`Upload Error: ${result.message || 'Failed to upload file.'}`);
            setUploadIsError(true);
        }
    } catch (error) {
        console.error('Upload fetch error:', error);
        setUploadStatus('Error: Could not connect to server during upload.');
        setUploadIsError(true);
    } finally {
        setIsLoading(false);
    }
  };


  // --- Send Message Handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('handleSubmit triggered');
    const numbersToSend = Array.from(selectedContacts);

    if (numbersToSend.length === 0) {
      setStatus('Error: Please select at least one contact.'); setStatusIsError(true); return;
    }
    if (!message.trim()) {
      setStatus('Error: Message cannot be empty.'); setStatusIsError(true); return;
    }

    setIsSending(true);
    setStatus(`Starting send script for ${numbersToSend.length} selected contacts...`);
    setStatusIsError(false);
    try {
      const response = await fetch(`${API_URL}/run-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, numbers: numbersToSend })
      });
      const result = await response.json();
      if (response.ok) {
        setStatus(`Success: ${result.message}`); setStatusIsError(false);
      } else {
        setStatus(`Error: ${result.message || `Request failed`}`); setStatusIsError(true);
      }
    } catch (error) {
      console.error('Submit fetch error:', error);
      setStatus('Error: Could not connect to the server during send.');
      setStatusIsError(true);
    } finally {
      setIsSending(false);
      if (showHistory) { setTimeout(fetchHistory, 3000); }
    }
  };

  // --- Delete Message Handler ---
  const handleDelete = async () => {
    console.log('handleDelete triggered');
    const numbersToDeleteFor = Array.from(selectedContacts);

    if (numbersToDeleteFor.length === 0) {
        setStatus('Error: Please select contacts before deleting.'); setStatusIsError(true); return;
    }
    if (!window.confirm(`Are you sure you want to attempt deleting the last SENT message for the ${numbersToDeleteFor.length} selected contacts?`)) {
      return;
    }
    
    setIsDeleting(true); // <-- This line was using an undefined function
    setStatus(`Starting delete script for ${numbersToDeleteFor.length} selected contacts...`);
    setStatusIsError(false);
    
    try {
      const response = await fetch(`${API_URL}/delete-last-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: numbersToDeleteFor })
      });
      const result = await response.json();
      if (response.ok) {
        setStatus(`Success: ${result.message}`); setStatusIsError(false);
      } else {
        setStatus(`Error: ${result.message || `Request failed`}`); setStatusIsError(true);
      }
    } catch (error) {
      console.error('Delete fetch error:', error);
      setStatus('Error: Could not connect to the server during delete.');
      setStatusIsError(true);
    } finally {
      setIsDeleting(false); // <-- This line was using an undefined function
      console.log('Scheduling history refresh after delete...');
      if (showHistory) {
        setTimeout(fetchHistory, 3000);
      }
    }
  };
  
 // --- UPDATED: Handle Removing Contact from UI AND Database ---
  const handleRemoveContact = async (numberToRemove) => {
    // 1. Confirm with the user
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete contact ${numberToRemove} from the database?`)) {
      return;
    }
    
    console.log('Attempting to delete contact from database:', numberToRemove);
    // Set a loading/status message if desired
    setStatus(`Deleting contact ${numberToRemove}...`);
    setStatusIsError(false);
    setIsLoading(true); // Use general loading state

    try {
      // 2. Make API call to the backend
      const response = await fetch(`${API_URL}/delete-contact/${numberToRemove}`, {
          method: 'DELETE',
      });
      const result = await response.json();

      if (response.ok && result.success) {
        console.log('Successfully deleted from DB:', numberToRemove);
        
        // 3. On success, remove from the main contacts list
        setContacts(prevContacts => 
            prevContacts.filter(contact => contact.number !== numberToRemove)
        );
        
        // 4. On success, remove from the selected contacts set
        setSelectedContacts(prevSelected => {
          const newSelected = new Set(prevSelected);
          newSelected.delete(numberToRemove); // Remove if it was selected
          return newSelected;
        });
        
        setStatus('Contact deleted successfully.');
        setStatusIsError(false);
      
      } else {
        // Handle backend error
        console.error('Failed to delete contact from DB:', result.message);
        setStatus(`Error: ${result.message || 'Failed to delete contact.'}`);
        setStatusIsError(true);
      }

    } catch (error) {
      // Handle network error
      console.error('Delete contact fetch error:', error);
      setStatus('Error: Could not connect to server to delete contact.');
      setStatusIsError(true);
    } finally {
        setIsLoading(false); // Clear loading state
        // Clear status message after a delay
        setTimeout(() => {
           if (status.includes('delet')) setStatus('');
        }, 4000);
    }
  };
  // --- END UPDATED ---

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
  const getStatusClass = (statusText) => {
    if (!statusText) return '';
    const lowerStatus = statusText.toLowerCase();
    if (lowerStatus.includes('success')) return 'status-success';
    if (lowerStatus.includes('delete')) return 'status-deleted';
    if (lowerStatus.includes('fail') || lowerStatus.includes('error') || lowerStatus.includes('invalid') || lowerStatus.includes('not ready')) return 'status-fail';
    return '';
   };
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

  // --- Render JSX ---
  const totalLoading = isLoading || isSending || isDeleting; // Combined loading state

  return (
    <>
      <header className="app-header">
        <i className="fa-brands fa-whatsapp"></i> WhatsApp Bulk Messenger
      </header>

      <main className="container">

        <section className="card form-card">
          <form onSubmit={handleSubmit}>
            <h2><i className="fa-solid fa-users"></i> Contacts & Message</h2>

            {/* --- Contact Selection Area --- */}
            <div className="form-group">
                <div className="contact-header">
                    <label>Select Contacts ({selectedContacts.size} selected)</label>
                    <div className="contact-controls">
                        <input
                            type="search"
                            placeholder="Filter contacts..."
                            className="contact-filter"
                            onChange={(e) => setFilterText(e.target.value)} // Simplified
                            disabled={totalLoading}
                        />
                         <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => fetchDefaultsAndContacts(true)} // Pass true for reload
                            disabled={totalLoading}
                            title="Reload contacts from Database"
                        >
                            <i className="fa-solid fa-sync"></i> Reload
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => { setShowAddManual(prev => !prev); setManualError(''); }}
                            disabled={totalLoading}
                            aria-expanded={showAddManual}
                        >
                            <i className={`fa-solid ${showAddManual ? 'fa-minus' : 'fa-plus'}`}></i> Add
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
                                disabled={isLoading} // Only disable for general loading/adding
                                required
                            />
                        </div>
                         <div className="form-group">
                            <label htmlFor="manual-number">Number (10 digits):</label>
                            <input
                                type="tel"
                                id="manual-number"
                                className="manual-input"
                                value={manualNumber}
                                onChange={(e) => setManualNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="Enter 10 digit number"
                                maxLength="10"
                                pattern="\d{10}"
                                title="Please enter exactly 10 digits."
                                disabled={isLoading}
                                required
                            />
                        </div>
                         {manualError && <p className="manual-error">{manualError}</p>}
                         <button
                            type="button"
                            className="btn btn-primary btn-small add-btn"
                            onClick={handleAddContact}
                            disabled={isLoading || !manualName.trim() || !manualNumber.match(/^\d{10}$/)}
                          >
                             <i className="fa-solid fa-user-plus"></i> Add to DB
                         </button>
                    </div>
                )}

                {/* --- Contact List Checkboxes --- */}
                <div className="contact-list">
                    {contacts.length === 0 && !isLoading ? (
                        <p className="no-contacts-msg">{status.includes('Could not fetch contacts') ? 'Error loading contacts.' : 'No contacts found.'}</p>
                    ) : (
                        filteredContacts.length === 0 && contacts.length > 0 ? (
                            <p className="no-contacts-msg">No contacts match filter.</p>
                        ) : (
                             filteredContacts.map((contact) => (
                                <div key={contact.id || contact.number} className="contact-item">
                                    <input
                                    type="checkbox"
                                    id={`contact-${contact.number}`}
                                    value={contact.number}
                                    checked={selectedContacts.has(contact.number)}
                                    onChange={handleCheckboxChange}
                                    disabled={totalLoading}
                                    />
                                    <label htmlFor={`contact-${contact.number}`}>
                                       {contact.name} <span className="contact-number">({contact.number})</span>
                                    </label>
                                    {/* --- *** NEW: Remove Button *** --- */}
                                    <button
                                        type="button"
                                        className="btn-icon contact-remove-btn"
                                        onClick={() => handleRemoveContact(contact.number)}
                                        disabled={totalLoading}
                                        title={`Remove ${contact.name} from this list (session only)`}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                    {/* --- *** END NEW *** --- */}
                                </div>
                             ))
                        )
                    )}
                     {isLoading && contacts.length === 0 && <p className="no-contacts-msg">Loading contacts...</p>}
                </div>
            </div>
            {/* --- END Contact Selection Area --- */}

            {/* --- File Upload Section --- */}
            <div className="form-group">
                <label>Upload New Contacts (CSV file with 'Name' and 'Number' headers)</label>
                <div className="upload-box">
                    <input
                        type="file"
                        id="file-upload-input"
                        className="file-input"
                        accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={handleFileChange}
                        disabled={totalLoading}
                    />
                    <label htmlFor="file-upload-input" className="btn btn-secondary file-label">
                        <i className="fa-solid fa-file-arrow-up"></i>
                        {selectedFile ? selectedFile.name : 'Choose file...'}
                    </label>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleUpload}
                        disabled={!selectedFile || totalLoading}
                    >
                        <i className="fa-solid fa-upload"></i> Upload
                    </button>
                </div>
                {uploadStatus && (
                    <p className={`upload-status ${uploadIsError ? 'status-error' : 'status-success'}`}>
                        {uploadStatus}
                    </p>
                )}
            </div>
            {/* --- END File Upload Section --- */}


            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                rows="5"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your message here..."
                disabled={totalLoading}
              ></textarea>
            </div>

            <div className="button-group">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={totalLoading || selectedContacts.size === 0}
              >
                <i className="fa-solid fa-paper-plane"></i>
                {isSending ? 'Sending...' : `Send to ${selectedContacts.size} Selected`}
              </button>
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={handleDelete}
                disabled={totalLoading || selectedContacts.size === 0}
              >
                <i className="fa-solid fa-trash-can"></i>
                {isDeleting ? 'Deleting...' : `Delete for ${selectedContacts.size} Selected`}
              </button>
            </div>

            {/* Main Status Message */}
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
            disabled={totalLoading}
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
                  disabled={totalLoading}
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

