import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Car, LogIn, UserPlus, Clock } from 'lucide-react';

export default function Login() {
  const { signIn, signUp, status } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'pending'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (status === 'pending_approval' || mode === 'pending') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div className="mx-auto p-3 bg-warning/10 rounded-full w-fit mb-2">
              <Clock className="w-8 h-8 text-warning" />
            </div>
            <CardTitle>Aguardando aprovação</CardTitle>
            <CardDescription>
              Sua conta foi criada. Aguarde o administrador aprovar seu acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              O administrador receberá sua solicitação e irá liberar o acesso no banco de dados.
            </p>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => setMode('login')}
            >
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const err = await signIn(email, password);
        if (err) setError(err === 'Invalid login credentials' ? 'Email ou senha incorretos' : err);
      } else {
        if (!name.trim()) { setError('Informe seu nome'); return; }
        const err = await signUp(email, password, name);
        if (err) setError(err);
        else setMode('pending');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary rounded-xl">
              <Car className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">OmniPark</h1>
          </div>
          <p className="text-muted-foreground text-sm">Sistema de Estacionamento</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{mode === 'login' ? 'Entrar' : 'Criar conta'}</CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'Use seu email e senha para acessar o sistema'
                : 'Crie uma conta e aguarde a aprovação do administrador'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Seu nome completo"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {mode === 'login' ? (
                  <><LogIn className="w-4 h-4 mr-2" />{loading ? 'Entrando…' : 'Entrar'}</>
                ) : (
                  <><UserPlus className="w-4 h-4 mr-2" />{loading ? 'Criando…' : 'Criar conta'}</>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              {mode === 'login' ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setMode('register'); setError(''); }}
                >
                  Não tem conta? <span className="text-primary font-medium">Criar conta</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setMode('login'); setError(''); }}
                >
                  Já tem conta? <span className="text-primary font-medium">Entrar</span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
