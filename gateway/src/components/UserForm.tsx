import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '../api';

const schema = z.object({
  nickname: z.string().min(3),
  name: z.string().optional(),
  password: z.string().min(6).optional(), // required only for creation
});

type FormData = z.infer<typeof schema>;

interface Props {
  userId?: number;
  onSuccess: () => void;
}

export function UserForm({ userId, onSuccess }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (userId) {
      api.get(`/users/${userId}`).then((res) => {
        setValue('nickname', res.data.nickname);
        setValue('name', res.data.name);
      });
    } else {
      reset();
    }
  }, [userId]);

  const onSubmit = async (data: FormData) => {
    if (userId) {
      await api.put(`/users/${userId}`, data);
    } else {
      await api.post('/users', data);
    }
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input placeholder="Никнейм" {...register('nickname')} />
      <p>{errors.nickname?.message}</p>

      <input placeholder="Имя" {...register('name')} />
      <p>{errors.name?.message}</p>

      {!userId && (
        <>
          <input type="password" placeholder="Пароль" {...register('password')} />
          <p>{errors.password?.message}</p>
        </>
      )}

      <select {...register('role')}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>

      <button type="submit">{userId ? 'Обновить' : 'Создать'}</button>
    </form>
  );
}
