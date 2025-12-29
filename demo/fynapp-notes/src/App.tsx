import React, { useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import "./styles.css";

interface Note {
  id: number;
  text: string;
  createdAt: Date;
}

interface AppProps {
  appName: string;
  runtime?: FynUnitRuntime;
}

const App: React.FC<AppProps> = ({ appName, runtime }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");

  const addNote = () => {
    if (newNote.trim()) {
      setNotes([
        ...notes,
        {
          id: Date.now(),
          text: newNote.trim(),
          createdAt: new Date(),
        },
      ]);
      setNewNote("");
    }
  };

  const deleteNote = (id: number) => {
    setNotes(notes.filter((note) => note.id !== id));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addNote();
    }
  };

  return (
    <div className="notes-container">
      <h2 className="notes-title">
        {appName} - React {React.version}
      </h2>

      <div className="notes-content">
        <div className="add-note-section">
          <input
            type="text"
            className="note-input"
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="add-button" onClick={addNote}>
            Add
          </button>
        </div>

        <div className="notes-list">
          {notes.length === 0 ? (
            <p className="empty-message">No notes yet. Add one above!</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="note-item">
                <span className="note-text">{note.text}</span>
                <button
                  className="delete-button"
                  onClick={() => deleteNote(note.id)}
                  title="Delete note"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="notes-stats">
          <small>{notes.length} note{notes.length !== 1 ? "s" : ""}</small>
        </div>

        {runtime && (
          <div className="runtime-info">
            <small>
              Running as: {runtime.fynApp.name} v{runtime.fynApp.version}
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
