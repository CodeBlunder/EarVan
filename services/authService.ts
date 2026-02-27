import { User, DatabaseSchema, HearingProfile } from '../types';

const DB_KEY = 'earvan_db_v1';
const SESSION_KEY = 'earvan_session_v1';

// Initialize DB if not exists
const initDB = () => {
  const existing = localStorage.getItem(DB_KEY);
  if (!existing) {
    const initialData: DatabaseSchema = { users: [] };
    localStorage.setItem(DB_KEY, JSON.stringify(initialData));
  }
};

const getDB = (): DatabaseSchema => {
  initDB();
  const data = localStorage.getItem(DB_KEY);
  return data ? JSON.parse(data) : { users: [] };
};

const saveDB = (data: DatabaseSchema) => {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const db = getDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      throw new Error('Invalid username or password');
    }
    
    // Return user without password
    const { password: _, ...safeUser } = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser as User;
  },

  signup: async (name: string, email: string, username: string, password: string): Promise<User> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const db = getDB();
    
    if (db.users.some(u => u.username === username)) {
      throw new Error('Username already exists');
    }
    
    if (db.users.some(u => u.email === email)) {
      throw new Error('Email already registered');
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      name,
      email,
      username,
      password // Storing strictly for the mock login to work.
    };

    db.users.push(newUser);
    saveDB(db);

    const { password: _, ...safeUser } = newUser;
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser as User;
  },

  updateProfile: async (userId: string, profile: HearingProfile): Promise<User> => {
     const db = getDB();
     const userIndex = db.users.findIndex(u => u.id === userId);
     
     if (userIndex === -1) throw new Error("User not found");
     
     db.users[userIndex].profile = profile;
     saveDB(db);
     
     // Update session
     const { password: _, ...safeUser } = db.users[userIndex];
     localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
     
     return safeUser as User;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  getCurrentUser: (): User | null => {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  }
};