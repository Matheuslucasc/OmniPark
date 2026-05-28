import { useState } from 'react';
import { CameraConfig, DEFAULT_CAMERA } from '@/types/parking';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Camera,
  Plus,
  Trash2,
  CheckCircle,
  Circle,
  Wifi,
  WifiOff,
  Edit2,
  Save,
  X,
  Info,
} from 'lucide-react';

const CAMERAS_KEY = 'parking_cameras';

function generateId() {
  return `cam-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

function buildStreamUrl(cam: CameraConfig): string {
  const auth =
    cam.username
      ? `${cam.username}${cam.password ? `:${cam.password}` : ''}@`
      : '';
  const path = cam.streamPath.startsWith('/') ? cam.streamPath : `/${cam.streamPath}`;
  return `${cam.protocol}://${auth}${cam.ipAddress}:${cam.port}${path}`;
}

export function CameraPanel() {
  const [cameras, setCameras] = useLocalStorage<CameraConfig[]>(CAMERAS_KEY, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const { toast } = useToast();

  const emptyForm = (): Omit<CameraConfig, 'id'> => ({ ...DEFAULT_CAMERA, isActive: cameras.length === 0 });
  const [form, setForm] = useState<Omit<CameraConfig, 'id'>>(emptyForm());
  const [editForm, setEditForm] = useState<CameraConfig | null>(null);

  /* ─── Helpers ─────────────────────────────────── */

  const setActive = (id: string) => {
    setCameras(prev => prev.map(c => ({ ...c, isActive: c.id === id })));
    toast({ title: 'Câmera ativa atualizada' });
  };

  const deleteCamera = (id: string) => {
    setCameras(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (remaining.length > 0 && !remaining.some(c => c.isActive)) {
        remaining[0].isActive = true;
      }
      return remaining;
    });
    toast({ title: 'Câmera removida' });
  };

  const addCamera = () => {
    if (!form.ipAddress || !form.name) {
      toast({ title: 'Preencha nome e IP', variant: 'destructive' });
      return;
    }
    const isFirst = cameras.length === 0;
    const newCam: CameraConfig = { id: generateId(), ...form, isActive: isFirst || form.isActive };
    if (newCam.isActive) {
      setCameras(prev => [...prev.map(c => ({ ...c, isActive: false })), newCam]);
    } else {
      setCameras(prev => [...prev, newCam]);
    }
    setForm(emptyForm());
    setShowAddForm(false);
    toast({ title: 'Câmera adicionada' });
  };

  const saveEdit = () => {
    if (!editForm) return;
    setCameras(prev =>
      prev.map(c => {
        if (c.id !== editForm.id) return editForm.isActive ? { ...c, isActive: false } : c;
        return editForm;
      })
    );
    setEditingId(null);
    setEditForm(null);
    toast({ title: 'Câmera atualizada' });
  };

  const testConnection = async (cam: CameraConfig) => {
    setTesting(cam.id);
    // Browser cannot directly ping RTSP; we do an HTTP check on IP:port
    const httpUrl = `http://${cam.ipAddress}:${cam.protocol === 'rtsp' ? 80 : cam.port}`;
    try {
      await fetch(httpUrl, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
      toast({ title: `${cam.name}: endereço alcançável`, description: 'O host respondeu.' });
    } catch {
      toast({
        title: `${cam.name}: sem resposta`,
        description: 'Verifique IP, porta e se a câmera está ligada.',
        variant: 'destructive',
      });
    }
    setTesting(null);
  };

  /* ─── Sub-components ──────────────────────────── */

  const FormFields = ({
    values,
    onChange,
  }: {
    values: Omit<CameraConfig, 'id'>;
    onChange: (v: Partial<Omit<CameraConfig, 'id'>>) => void;
  }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Nome da câmera *</Label>
        <Input
          placeholder="Ex: Câmera Entrada"
          value={values.name}
          onChange={e => onChange({ name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Localização</Label>
        <Input
          placeholder="Ex: Entrada, Saída, Lateral"
          value={values.location ?? ''}
          onChange={e => onChange({ location: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Endereço IP *</Label>
        <Input
          placeholder="192.168.1.100"
          value={values.ipAddress}
          onChange={e => onChange({ ipAddress: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Porta</Label>
        <Input
          type="number"
          placeholder="554"
          value={values.port}
          onChange={e => onChange({ port: parseInt(e.target.value) || 554 })}
        />
      </div>
      <div className="space-y-2">
        <Label>Protocolo</Label>
        <Select
          value={values.protocol}
          onValueChange={v => onChange({ protocol: v as CameraConfig['protocol'] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rtsp">RTSP (câmeras IP padrão)</SelectItem>
            <SelectItem value="http">HTTP (webcam/stream HTTP)</SelectItem>
            <SelectItem value="https">HTTPS (stream seguro)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Caminho do stream</Label>
        <Input
          placeholder="/stream"
          value={values.streamPath}
          onChange={e => onChange({ streamPath: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Usuário (opcional)</Label>
        <Input
          placeholder="admin"
          value={values.username ?? ''}
          onChange={e => onChange({ username: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Senha (opcional)</Label>
        <Input
          type="password"
          placeholder="••••••"
          value={values.password ?? ''}
          onChange={e => onChange({ password: e.target.value })}
        />
      </div>
    </div>
  );

  const activeCamera = cameras.find(c => c.isActive);

  return (
    <div className="space-y-6">
      {/* Active camera info */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="w-5 h-5 text-primary" />
            Câmera Ativa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCamera ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default" className="gap-1">
                  <Wifi className="w-3 h-3" />
                  {activeCamera.name}
                </Badge>
                {activeCamera.location && (
                  <Badge variant="secondary">{activeCamera.location}</Badge>
                )}
              </div>
              <div className="font-mono text-sm bg-muted p-3 rounded-lg break-all">
                {buildStreamUrl(activeCamera)}
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                Use esta URL no seu script Python para capturar frames e enviar placas lidas via API.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma câmera configurada ainda.</p>
          )}
        </CardContent>
      </Card>

      {/* Integration guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            Como integrar com o Python (OCR)
          </CardTitle>
          <CardDescription>
            Exemplo de como conectar seu script de leitura de placas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
{`import cv2, requests

# URL gerada acima
STREAM_URL = "${activeCamera ? buildStreamUrl(activeCamera) : 'rtsp://192.168.1.100:554/stream'}"
API_URL    = "https://seu-app.vercel.app/api/plate-read"

cap = cv2.VideoCapture(STREAM_URL)
while True:
    ret, frame = cap.read()
    if not ret: break
    plate = seu_ocr(frame)           # retorna ex. "ABC1D23"
    if plate:
        requests.post(API_URL, json={"plate": plate})
cap.release()`}
          </pre>
        </CardContent>
      </Card>

      {/* Camera list */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Câmeras Configuradas ({cameras.length})</h3>
        <Button size="sm" onClick={() => { setShowAddForm(true); setForm(emptyForm()); }}>
          <Plus className="w-4 h-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nova câmera</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormFields values={form} onChange={v => setForm(prev => ({ ...prev, ...v }))} />
            <div className="flex gap-2 pt-2">
              <Button onClick={addCamera} className="flex-1">
                <Save className="w-4 h-4 mr-1" />
                Salvar
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cameras.length === 0 && !showAddForm && (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
          <Camera className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma câmera cadastrada.</p>
          <p className="text-sm mt-1">Clique em "Adicionar" para configurar sua primeira câmera IP.</p>
        </div>
      )}

      {/* Camera cards */}
      <div className="space-y-3">
        {cameras.map(cam =>
          editingId === cam.id && editForm ? (
            <Card key={cam.id} className="border-primary">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Editar câmera</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormFields
                  values={editForm}
                  onChange={v => setEditForm(prev => prev ? { ...prev, ...v } : prev)}
                />
                <div className="flex gap-2 pt-2">
                  <Button onClick={saveEdit} className="flex-1">
                    <Save className="w-4 h-4 mr-1" />
                    Salvar
                  </Button>
                  <Button variant="outline" onClick={() => { setEditingId(null); setEditForm(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card key={cam.id} className={cam.isActive ? 'border-primary/50 bg-primary/5' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {cam.isActive ? (
                      <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium truncate">{cam.name}</span>
                    {cam.location && (
                      <Badge variant="outline" className="text-xs">{cam.location}</Badge>
                    )}
                    {cam.isActive && (
                      <Badge variant="default" className="text-xs">Ativa</Badge>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Testar conexão"
                      disabled={testing === cam.id}
                      onClick={() => testConnection(cam)}
                    >
                      {testing === cam.id ? (
                        <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                      ) : (
                        <Wifi className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Editar"
                      onClick={() => { setEditingId(cam.id); setEditForm({ ...cam }); }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    {!cam.isActive && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Remover"
                        onClick={() => deleteCamera(cam.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 font-mono text-xs text-muted-foreground bg-muted px-3 py-2 rounded truncate">
                  {buildStreamUrl(cam)}
                </div>

                {!cam.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => setActive(cam.id)}
                  >
                    Definir como ativa
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
