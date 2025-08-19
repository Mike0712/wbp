import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '../api';

const schema = z.object({
  nickname: z.string().min(3),
  password: z.string().min(6),
});

type LoginFormData = z.infer<typeof schema>;

export function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await api.post('/auth/login', data);
      localStorage.setItem('accessToken', res.data.accessToken); // or use context
      alert('Успешный вход!');
    } catch (err) {
      alert('Ошибка авторизации');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input placeholder="Никнейм" {...register('nickname')} />
      <p>{errors.nickname?.message}</p>

      <input type="password" placeholder="Пароль" {...register('password')} />
      <p>{errors.password?.message}</p>

      <button type="submit">Войти</button>
    </form>
  );
}
