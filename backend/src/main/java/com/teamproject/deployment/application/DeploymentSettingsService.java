package com.teamproject.deployment.application;

import com.teamproject.admin.application.AdminNoticeService;
import com.teamproject.admin.application.dto.AdminDtos.CreateAdminNoticeRequest;
import com.teamproject.common.exception.ApplicationException;
import com.teamproject.deployment.application.dto.DeploymentSettingsDtos.JobView;
import com.teamproject.deployment.application.dto.DeploymentSettingsDtos.SettingsView;
import com.teamproject.deployment.domain.DeploymentSettings;
import com.teamproject.deployment.domain.DeploymentSettingsRepository;
import com.teamproject.deployment.infrastructure.HostApplyGateway;
import com.teamproject.deployment.infrastructure.HostApplyGateway.HostApplyResult;
import com.teamproject.operations.domain.InfrastructureChangeJob;
import com.teamproject.operations.domain.InfrastructureChangeJob.Status;
import com.teamproject.operations.domain.InfrastructureChangeJob.Type;
import com.teamproject.operations.domain.InfrastructureChangeJobRepository;
import com.teamproject.user.domain.User;
import com.teamproject.user.domain.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Service
public class DeploymentSettingsService {

    private static final int MAX_PEM_BYTES = 64 * 1024;
    private static final String CANDIDATE_MODE = "uploaded";

    private final DeploymentSettingsRepository settings;
    private final InfrastructureChangeJobRepository jobs;
    private final UserRepository users;
    private final HostApplyGateway hostApply;
    private final PublicUrlProvider publicUrls;
    private final AdminNoticeService notices;
    private final Path controlRoot;
    private final long resultWaitMs;

    public DeploymentSettingsService(DeploymentSettingsRepository settings,
            InfrastructureChangeJobRepository jobs, UserRepository users, HostApplyGateway hostApply,
            PublicUrlProvider publicUrls, AdminNoticeService notices,
            @org.springframework.beans.factory.annotation.Value(
                    "${app.host-apply.control-root:/var/lib/gearvia/control}") String controlRoot,
            @org.springframework.beans.factory.annotation.Value(
                    "${app.host-apply.result-wait-ms:6000}") long resultWaitMs) {
        this.settings = settings;
        this.jobs = jobs;
        this.users = users;
        this.hostApply = hostApply;
        this.publicUrls = publicUrls;
        this.notices = notices;
        this.controlRoot = Path.of(controlRoot);
        this.resultWaitMs = resultWaitMs;
    }

    @Transactional(readOnly = true)
    public SettingsView currentView() {
        return settings.findById(DeploymentSettings.SINGLETON_ID)
                .map(value -> new SettingsView(value.getPublicUrl(), value.getStatus(),
                        value.getCertificateIssuer(), string(value.getCertificateNotAfter()),
                        value.getCertificateSans(), value.getApplyVersion()))
                .orElseGet(() -> new SettingsView(publicUrls.current().toString(), "BOOTSTRAP",
                        null, null, null, 0));
    }

    @Transactional
    public JobView createDraft(String publicUrl, MultipartFile certificate, MultipartFile privateKey,
            Long actorId) {
        String normalizedUrl = normalizeUrl(publicUrl);
        byte[] certPem = read(certificate, "certificate");
        byte[] keyPem = read(privateKey, "privateKey");
        validateMaterial(certPem, keyPem);

        User actor = users.findById(actorId)
                .orElseThrow(() -> error("DEPLOYMENT_ACTOR_NOT_FOUND", HttpStatus.NOT_FOUND,
                        "요청 사용자를 찾을 수 없습니다."));
        InfrastructureChangeJob job = new InfrastructureChangeJob(Type.DOMAIN_TLS, actor, normalizedUrl,
                120, "tls-" + UUID.randomUUID().toString().substring(0, 12));
        jobs.saveAndFlush(job);

        hostApply.writeCandidate(requestId(job.getId()), certPem, keyPem);
        return view(job);
    }

    @Transactional
    public JobView test(Long jobId) {
        InfrastructureChangeJob job = requireJob(jobId);
        if (job.getStatus() == Status.TEST_SUCCEEDED) {
            return view(job);
        }
        if (job.getStatus() != Status.DRAFT && job.getStatus() != Status.FAILED) {
            throw error("DEPLOYMENT_JOB_NOT_DRAFT", HttpStatus.CONFLICT,
                    "초안 상태의 작업만 테스트할 수 있습니다.");
        }
        byte[][] material = readCandidate(job.getId());
        validateMaterial(material[0], material[1]);
        job.transitionTo(Status.TESTING, 0, null);
        job.transitionTo(Status.TEST_SUCCEEDED, 100, "인증서 형식, 만료일, 개인 키 일치를 확인했습니다.");
        return view(jobs.saveAndFlush(job));
    }

    @Transactional
    public JobView apply(Long jobId, Long actorId) {
        InfrastructureChangeJob job = requireJob(jobId);
        if (job.getStatus() != Status.TEST_SUCCEEDED) {
            throw error("DEPLOYMENT_JOB_NOT_TESTED", HttpStatus.CONFLICT,
                    "테스트가 성공한 작업만 적용할 수 있습니다.");
        }
        notices.create(actorId, new CreateAdminNoticeRequest(
                abbreviate("도메인/SSL 적용 예정: " + job.getRedactedTarget(), 160),
                "도메인/SSL 인증서를 적용합니다. 적용 중 웹 접속이 수십 초간 중단될 수 있습니다.",
                java.time.LocalDateTime.now()));
        job.transitionTo(Status.NOTIFYING, 20, "전체 사용자 공지를 완료했습니다.");
        String requestId = requestId(job.getId());
        hostApply.submit(requestId, job.getRedactedTarget(), CANDIDATE_MODE);
        finalizeFromResult(job, awaitHostResult(requestId));
        return view(jobs.saveAndFlush(job));
    }

    /**
     * The root-owned applier runs asynchronously via a systemd path unit, so its
     * result file usually lands a few seconds after {@code submit}. Wait briefly
     * for it so the common case finalizes in one request; slower hosts fall back
     * to {@code SWITCHED} and are resolved by a later {@link #jobView} poll.
     */
    private HostApplyResult awaitHostResult(String requestId) {
        long deadlineNanos = System.nanoTime() + resultWaitMs * 1_000_000L;
        while (true) {
            HostApplyResult result = hostApply.readResult(requestId).orElse(null);
            if (result != null || System.nanoTime() >= deadlineNanos) {
                return result;
            }
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
    }

    @Transactional
    public JobView jobView(Long jobId) {
        InfrastructureChangeJob job = requireJob(jobId);
        if (job.getStatus() == Status.SWITCHED) {
            hostApply.readResult(requestId(job.getId())).ifPresent(result -> {
                finalizeFromResult(job, result);
                jobs.saveAndFlush(job);
            });
        }
        return view(job);
    }

    private void finalizeFromResult(InfrastructureChangeJob job, HostApplyResult result) {
        if (result == null) {
            job.transitionTo(Status.SWITCHED, 80, "호스트 적용 결과를 기다리는 중입니다.");
            return;
        }
        if (result.succeeded()) {
            job.transitionTo(Status.SWITCHED, 80, "후보 인증서를 적용했습니다.");
            job.transitionTo(Status.COMPLETED, 100, "SAN: " + result.certificateSans());
            settings.save(new DeploymentSettings(job.getRedactedTarget()));
        } else {
            job.transitionTo(Status.FAILED, 100, result.code());
            job.transitionTo(Status.ROLLED_BACK, 100,
                    "이전 인증서로 복구되었습니다 (" + result.status() + ").");
        }
    }

    private void validateMaterial(byte[] certPem, byte[] keyPem) {
        if (certPem.length == 0 || keyPem.length == 0) {
            throw error("DEPLOYMENT_MATERIAL_EMPTY", HttpStatus.BAD_REQUEST, "인증서와 개인 키가 필요합니다.");
        }
        if (certPem.length > MAX_PEM_BYTES || keyPem.length > MAX_PEM_BYTES) {
            throw error("DEPLOYMENT_MATERIAL_TOO_LARGE", HttpStatus.BAD_REQUEST,
                    "인증서 또는 개인 키 파일이 너무 큽니다.");
        }
        X509Certificate certificate = parseCertificate(certPem);
        try {
            certificate.checkValidity();
        } catch (GeneralSecurityException e) {
            throw error("DEPLOYMENT_CERTIFICATE_EXPIRED", HttpStatus.BAD_REQUEST,
                    "인증서가 만료되었거나 아직 유효하지 않습니다.");
        }
        assertKeyMatchesCertificate(certificate, parsePrivateKey(keyPem));
    }

    private X509Certificate parseCertificate(byte[] pem) {
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            java.security.cert.Certificate parsed =
                    factory.generateCertificate(new ByteArrayInputStream(pem));
            if (parsed instanceof X509Certificate x509) {
                return x509;
            }
        } catch (CertificateException ignored) {
            // fall through
        }
        throw error("DEPLOYMENT_CERTIFICATE_INVALID", HttpStatus.BAD_REQUEST,
                "인증서 PEM 형식이 올바르지 않습니다.");
    }

    private PrivateKey parsePrivateKey(byte[] pem) {
        String base64 = new String(pem, StandardCharsets.UTF_8)
                .replaceAll("-----BEGIN [A-Z0-9 ]+-----", "")
                .replaceAll("-----END [A-Z0-9 ]+-----", "")
                .replaceAll("\\s", "");
        byte[] der;
        try {
            der = Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            throw error("DEPLOYMENT_PRIVATE_KEY_INVALID", HttpStatus.BAD_REQUEST,
                    "개인 키 PEM 형식이 올바르지 않습니다.");
        }
        for (String algorithm : List.of("RSA", "EC")) {
            try {
                return KeyFactory.getInstance(algorithm).generatePrivate(new PKCS8EncodedKeySpec(der));
            } catch (GeneralSecurityException ignored) {
                // try next algorithm
            }
        }
        throw error("DEPLOYMENT_PRIVATE_KEY_INVALID", HttpStatus.BAD_REQUEST,
                "개인 키는 PKCS#8 PEM 형식이어야 합니다.");
    }

    private void assertKeyMatchesCertificate(X509Certificate certificate, PrivateKey key) {
        PublicKey certificateKey = certificate.getPublicKey();
        if (certificateKey instanceof RSAPublicKey rsaPublic && key instanceof RSAPrivateCrtKey rsaPrivate
                && (!rsaPublic.getModulus().equals(rsaPrivate.getModulus())
                        || !rsaPublic.getPublicExponent().equals(rsaPrivate.getPublicExponent()))) {
            throw error("DEPLOYMENT_CERTIFICATE_KEY_MISMATCH", HttpStatus.BAD_REQUEST,
                    "인증서와 개인 키가 일치하지 않습니다.");
        }
    }

    private byte[][] readCandidate(long jobId) {
        Path dir = controlRoot.resolve("candidates").resolve(requestId(jobId));
        try {
            return new byte[][] {
                    Files.readAllBytes(dir.resolve("fullchain.pem")),
                    Files.readAllBytes(dir.resolve("privkey.pem"))
            };
        } catch (IOException e) {
            throw error("DEPLOYMENT_CANDIDATE_MISSING", HttpStatus.CONFLICT,
                    "후보 인증서 파일을 찾을 수 없습니다. 초안을 다시 만들어 주세요.");
        }
    }

    private String normalizeUrl(String publicUrl) {
        try {
            java.net.URI uri = DeploymentSettings.validatePublicUrl(publicUrl);
            String host = uri.getHost().toLowerCase();
            return uri.getPort() < 0 ? "https://" + host : "https://" + host + ":" + uri.getPort();
        } catch (IllegalArgumentException e) {
            throw error("DEPLOYMENT_PUBLIC_URL_INVALID", HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    private byte[] read(MultipartFile file, String field) {
        if (file == null || file.isEmpty()) {
            throw error("DEPLOYMENT_MATERIAL_EMPTY", HttpStatus.BAD_REQUEST, field + " 파일이 필요합니다.");
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw error("DEPLOYMENT_MATERIAL_UNREADABLE", HttpStatus.BAD_REQUEST,
                    field + " 파일을 읽을 수 없습니다.");
        }
    }

    private InfrastructureChangeJob requireJob(Long jobId) {
        InfrastructureChangeJob job = jobs.findById(jobId)
                .orElseThrow(() -> error("DEPLOYMENT_JOB_NOT_FOUND", HttpStatus.NOT_FOUND,
                        "도메인/SSL 변경 작업을 찾을 수 없습니다."));
        if (job.getType() != Type.DOMAIN_TLS) {
            throw error("DEPLOYMENT_JOB_NOT_FOUND", HttpStatus.NOT_FOUND,
                    "도메인/SSL 변경 작업을 찾을 수 없습니다.");
        }
        return job;
    }

    private static String requestId(long jobId) {
        return "tls-" + jobId;
    }

    private static String abbreviate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private static String string(java.time.LocalDateTime value) {
        return value == null ? null : value.toString();
    }

    private JobView view(InfrastructureChangeJob job) {
        return new JobView(job.getId(), job.getType().name(), job.getStatus().name(),
                job.getRedactedTarget(), job.getProgressPercent(), job.getVerificationSummary(),
                job.getFailureCode(), job.getRollbackSummary(), job.getVersion());
    }

    private ApplicationException error(String code, HttpStatus status, String message) {
        return new ApplicationException(code, status, message);
    }
}
