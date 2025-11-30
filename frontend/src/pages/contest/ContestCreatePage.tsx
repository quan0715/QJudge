import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form,
  Stack,
  TextInput,
  Button,
  RadioButton,
  RadioButtonGroup,
  InlineNotification,
  Tile
} from '@carbon/react';
import { api } from '@/services/api';

const ContestCreatePage = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('請輸入競賽名稱');
      return;
    }

    if (visibility === 'private' && !password.trim()) {
      setError('私人競賽需要設定密碼');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const now = new Date();
      const startTime = new Date(now);
      startTime.setDate(startTime.getDate() + 1); // Tomorrow
      const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000); // +4 hours

      const contest = await api.createContest({
        name: name.trim(),
        description: description.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        visibility,
        password: visibility === 'private' ? password : undefined
      });

      // Navigate to contest page in teacher view
      navigate(`/contests/${contest.id}?view=teacher`);
    } catch (err: any) {
      setError(err.message || '建立競賽失敗');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>建立新競賽</h1>

      <Tile style={{ padding: '2rem' }}>
        <Form onSubmit={handleSubmit}>
          <Stack gap={6}>
            {error && (
              <InlineNotification
                kind="error"
                title="錯誤"
                subtitle={error}
                onClose={() => setError('')}
                lowContrast
              />
            )}

            <InlineNotification
              kind="info"
              title="提示"
              subtitle="建立競賽時只需填寫基本資訊，其餘設定（開始/結束時間、題目等）可在建立後編輯"
              lowContrast
            />

            <TextInput
              id="contest-name"
              labelText="競賽名稱"
              placeholder="輸入競賽名稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <TextInput
              id="contest-description"
              labelText="競賽敘述"
              placeholder="輸入競賽敘述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <RadioButtonGroup
              legendText="可見性"
              name="visibility"
              defaultSelected={visibility}
              onChange={(value) => setVisibility(value as 'public' | 'private')}
            >
              <RadioButton
                id="visibility-public"
                labelText="公開 - 所有人都可以看到並加入此競賽"
                value="public"
              />
              <RadioButton
                id="visibility-private"
                labelText="私人 - 需要密碼才能加入此競賽"
                value="private"
              />
            </RadioButtonGroup>

            {visibility === 'private' && (
              <div style={{ marginBottom: '1rem' }}>
                <form onSubmit={(e) => { e.preventDefault(); }}>
                  <TextInput
                    id="password"
                    labelText="競賽密碼"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請輸入密碼"
                    autoComplete="new-password"
                  />
                </form>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <Button type="submit" disabled={creating}>
                {creating ? '建立中...' : '建立競賽'}
              </Button>
              <Button
                kind="secondary"
                onClick={() => navigate('/contests')}
                disabled={creating}
              >
                取消
              </Button>
            </div>
          </Stack>
        </Form>
      </Tile>
    </div>
  );
};

export default ContestCreatePage;
