import { User, DatabaseSchema, HearingProfile, normalizeProfile } from '../types';

const DB_KEY = 'earvan_db_v1';
const SESSION_KEY = 'earvan_session_v1';

// Initialize local fallback DB if not exists
const initLocalDB = () => {
  const existing = localStorage.getItem(DB_KEY);
  if (!existing) {
    const initialData: DatabaseSchema = { users: [] };
    localStorage.setItem(DB_KEY, JSON.stringify(initialData));
  }
};

const getLocalDB = (): DatabaseSchema => {
  initLocalDB();
  const data = localStorage.getItem(DB_KEY);
  return data ? JSON.parse(data) : { users: [] };
};

const saveLocalDB = (data: DatabaseSchema) => {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
};

export const authService = {
  login: async (username: string, password: string): Promise<User> => {
    try {
      // 1. Try connecting to backend MongoDB API
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const user: User = await res.json();
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        return user;
      }

      if (res.status === 401 || res.status === 400 || res.status === 404) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Invalid username or password');
      }
    } catch (err: any) {
      if (err.message === 'Invalid username or password') {
        throw err;
      }
      console.warn('[Earvan] Backend API offline. Falling back to local offline storage.');
    }

    // 2. Offline / Local fallback if backend is not running
    await new Promise(resolve => setTimeout(resolve, 400));
    const db = getLocalDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      throw new Error('Invalid username or password');
    }
    
    const { password: _, ...safeUser } = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser as User;
  },

  signup: async (name: string, email: string, username: string, password: string): Promise<User> => {
    try {
      // 1. Try registering in backend MongoDB
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, username, password })
      });

      if (res.ok) {
        const user: User = await res.json();
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        return user;
      }

      if (res.status === 409 || res.status === 400) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to sign up');
      }
    } catch (err: any) {
      if (err.message && err.message.includes('already')) {
        throw err;
      }
      console.warn('[Earvan] Backend API offline. Registering in local offline storage.');
    }

    // 2. Offline / Local fallback if backend is not running
    await new Promise(resolve => setTimeout(resolve, 400));
    const db = getLocalDB();
    
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
      password
    };

    db.users.push(newUser);
    saveLocalDB(db);

    const { password: _, ...safeUser } = newUser;
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return safeUser as User;
  },

  updateProfile: async (userId: string, profile: HearingProfile): Promise<User> => {
    const normalizedProfile = normalizeProfile(profile);
    try {
      // 1. Save directly to MongoDB database
      const res = await fetch(`/api/user/profile/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: normalizedProfile })
      });

      if (res.ok) {
        const updatedUser: User = await res.json();
        localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
        console.log('[Earvan] Binaural hearing profile successfully saved to MongoDB database.');
        return updatedUser;
      }
    } catch (err) {
      console.warn('[Earvan] Backend unreachable. Persisting hearing profile locally.');
    }

    // 2. Fallback to local storage
    const db = getLocalDB();
    const userIndex = db.users.findIndex(u => u.id === userId);
    
    if (userIndex !== -1) {
      db.users[userIndex].profile = normalizedProfile;
      saveLocalDB(db);
    }

    // Always update current session cache
    const currentSession = authService.getCurrentUser();
    const updatedUser: User = currentSession 
      ? { ...currentSession, profile: normalizedProfile } 
      : { id: userId, name: 'User', email: '', username: '', profile: normalizedProfile };
      
    localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
    return updatedUser;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  getCurrentUser: (): User | null => {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  }
};
