import { useEffect, useRef, useState } from 'react';
import { adminApi, DeploymentJob, DeploymentSettingsStatus } from '../../../api/adminApi';
import { errorMessage } from '../../../api/client';
import { useLanguage } from '../../../app/LanguageContext';

// The host applier runs asynchronously (systemd path unit), so apply() first
// returns SWITCHED; poll the job until it finalizes before trusting the result.
const TERMINAL_STATES = new Set(['COMPLETED', 'ROLLED_BACK', 'FAILED']);
const MAX_POLLS = 150;

export function AdminDeploymentSettingsPage({ pollIntervalMs = 2000 }: { pollIntervalMs?: number } = {}) {
  const { t } = useLanguage();
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  const [status, setStatus] = useState<DeploymentSettingsStatus>();
  const [error, setError] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [certificate, setCertificate] = useState<File>();
  const [privateKey, setPrivateKey] = useState<File>();
  const [job, setJob] = useState<DeploymentJob>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.deploymentSettings()
      .then((value) => { setStatus(value); setPublicUrl(value.publicUrl); })
      .catch((value) => setError(errorMessage(value)));
  }, []);

  const tested = job?.status === 'TEST_SUCCEEDED';

  async function runTest() {
    if (!certificate || !privateKey) {
      setError(t('인증서와 개인 키 파일을 모두 선택하세요.', 'Choose both the certificate and private key files.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const draft = await adminApi.createDeploymentDraft(publicUrl, certificate, privateKey);
      setJob(await adminApi.testDeploymentJob(draft.jobId));
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!job || !tested) return;
    setBusy(true);
    setError('');
    try {
      let current = await adminApi.applyDeploymentJob(job.jobId);
      setJob(current);
      for (let i = 0; i < MAX_POLLS && !cancelled.current && !TERMINAL_STATES.has(current.status); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        if (cancelled.current) return;
        current = await adminApi.deploymentJob(job.jobId);
        if (cancelled.current) return;
        setJob(current);
      }
      const refreshed = await adminApi.deploymentSettings();
      if (!cancelled.current) setStatus(refreshed);
    } catch (value) {
      if (!cancelled.current) setError(errorMessage(value));
    } finally {
      if (!cancelled.current) setBusy(false);
    }
  }

  return (
    <div className="admin-panel admin-deployment-settings">
      <h2>{t('도메인·SSL 설정', 'Domain & SSL')}</h2>
      {error && <p className="error">{error}</p>}

      {status && (
        <dl className="admin-deployment-current">
          <dt>{t('현재 공개 URL', 'Current public URL')}</dt><dd>{status.publicUrl}</dd>
          <dt>{t('인증서 발급자', 'Certificate issuer')}</dt><dd>{status.certificateIssuer ?? '-'}</dd>
          <dt>{t('만료일', 'Expires')}</dt><dd>{status.certificateNotAfter ?? '-'}</dd>
          <dt>{t('SAN', 'SAN')}</dt><dd>{status.certificateSans.join(', ') || '-'}</dd>
          <dt>{t('상태', 'Status')}</dt><dd>{status.status}</dd>
        </dl>
      )}

      <label>
        {t('공개 URL', 'Public URL')}
        <input value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)}
          placeholder="https://gearvia.corp" />
      </label>
      <label>
        {t('인증서 파일', 'Certificate file')}
        <input type="file" accept=".pem,.crt"
          onChange={(event) => setCertificate(event.target.files?.[0])} />
      </label>
      <label>
        {t('개인 키 파일', 'Private key file')}
        <input type="file" accept=".pem,.key"
          onChange={(event) => setPrivateKey(event.target.files?.[0])} />
      </label>

      <div className="admin-inline">
        <button type="button" className="primary" disabled={busy} onClick={runTest}>
          {t('연결 테스트', 'Connection test')}
        </button>
        <button type="button" className="primary" disabled={busy || !tested} onClick={apply}>
          {t('적용', 'Apply')}
        </button>
      </div>

      {tested && (
        <section className="admin-deployment-apply-plan">
          <h3>{t('예상 중단 시간', 'Estimated downtime')}</h3>
          <p>{t(
            '적용 시 웹 컨테이너가 재생성되며 수십 초 동안 접속이 끊길 수 있습니다. 적용 직전 전체 사용자에게 공지가 발송됩니다.',
            'Applying recreates the web container; access may drop for tens of seconds. All users are notified just before apply.',
          )}</p>
        </section>
      )}

      {job && (
        <p className="admin-deployment-job">
          {t('작업 상태', 'Job status')}: <strong>{job.status}</strong> ({job.progressPercent}%)
          {job.failureCode && <span className="error"> — {job.failureCode}</span>}
          {job.rollbackSummary && <span> — {job.rollbackSummary}</span>}
        </p>
      )}
    </div>
  );
}
