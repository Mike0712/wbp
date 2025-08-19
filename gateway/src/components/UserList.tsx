import { useEffect, useState } from 'react';
import api from '../api';

interface User {
  id: number;
  nickname: string;
  name: string;
}

export function UserList() {
  const [users, setUsers] = useState<User[]>([]);

  const loadUsers = async () => {
    const res = await api.get('/users');
    setUsers(res.data);
  };

  const deleteUser = async (id: number) => {
    await api.delete(`/users/${id}`);
    loadUsers();
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>
      <h2>Пользователи</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.nickname} ({u.name})
            <button onClick={() => deleteUser(u.id)}>Удалить</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
