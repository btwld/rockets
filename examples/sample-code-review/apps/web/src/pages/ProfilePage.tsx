import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Spinner } from '../components/ui/spinner';
import {
  fetchMe,
  updateProfile,
  type MeResponse,
  type UserMetadataPayload,
} from '../lib/api';
import { getIdToken } from '../lib/firebase';

function readMetadata(me: MeResponse): UserMetadataPayload {
  const meta = me.userMetadata;
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  const row = meta as Record<string, unknown>;
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    firstName: typeof row.firstName === 'string' ? row.firstName : '',
    lastName: typeof row.lastName === 'string' ? row.lastName : '',
  };
}

export function ProfilePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getIdToken();
        const profile = await fetchMe(token);
        setMe(profile);
        const meta = readMetadata(profile);
        setFirstName(meta.firstName ?? '');
        setLastName(meta.lastName ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const token = await getIdToken();
      const meta = readMetadata(me ?? { id: '' });
      const payload: UserMetadataPayload = {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      };
      if (meta.id) {
        payload.id = meta.id;
      }
      const updated = await updateProfile(token, payload);
      setMe(updated);
      setSuccess('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Profile"
      subtitle="Manage the profile fields stored by the API."
    >
      {loading ? <Spinner label="Loading profile…" /> : null}
      {error ? (
        <Alert variant="error" testId="profile-error">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert variant="success" testId="profile-success">
          {success}
        </Alert>
      ) : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="bg-[linear-gradient(150deg,rgba(23,32,51,0.95),rgba(36,53,77,0.92))] text-white">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[#f0c792]">
              Firebase identity
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em]">
              {me?.email ?? me?.id ?? 'Unknown user'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              External identity stays in Firebase; the API only receives the
              validated token and exposes the merged profile in `/me`.
            </p>

            <div className="mt-8 space-y-3">
              <div className="rounded-[1.25rem] border border-white/12 bg-white/8 px-4 py-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.26em] text-[#f0c792]">
                  User id
                </p>
                <code className="mt-2 block break-all text-sm text-white/90">
                  {me?.id}
                </code>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-white/8 px-4 py-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.26em] text-[#8dd6cf]">
                  Metadata adapter
                </p>
                <p className="mt-2 text-sm text-slate-100">
                  Persisted by Rockets and returned alongside the authenticated profile.
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-[color:var(--app-card-strong)]">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[#8c5d2f]">
              User metadata
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-slate-950">
              Public profile fields
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              These fields live in the sample backend and demonstrate the merge
              between authenticated identity and app-owned data.
            </p>

            <form className="mt-8 space-y-5" onSubmit={onSubmit}>
              <Input
                label="First name"
                type="text"
                data-testid="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={100}
                placeholder="Ada"
              />
              <Input
                label="Last name"
                type="text"
                data-testid="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={100}
                placeholder="Lovelace"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  data-testid="profile-save"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save profile'}
                </Button>
                <span className="text-sm text-slate-500">
                  Updates the payload sent to <code>PATCH /me</code>.
                </span>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
