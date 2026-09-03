package com.teamproject.deployment;

import com.teamproject.B2BGearViaApplication;
import com.teamproject.authentication.application.AccessSessionIssuer;
import com.teamproject.admin.domain.AdminNoticeRepository;
import com.teamproject.authentication.domain.token.RefreshToken.ClientMode;
import com.teamproject.authentication.domain.token.SessionDevice;
import com.teamproject.deployment.domain.DeploymentSettings;
import com.teamproject.deployment.domain.DeploymentSettingsRepository;
import com.teamproject.user.domain.User;
import com.teamproject.user.domain.UserRepository;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = B2BGearViaApplication.class, properties = {
        "app.admin.enabled=true",
        "app.admin.allowed-ips=127.0.0.1",
        "app.host-apply.control-root=${java.io.tmpdir}/gearvia-tls-api-test",
        "app.host-apply.hmac-key=test-hmac-key-abcdef0123456789",
        "app.host-apply.result-wait-ms=4000"
})
@AutoConfigureMockMvc
@Transactional
class AdminDeploymentSettingsApiTest {

    private static byte[] certPem;
    private static byte[] keyPem;
    private static Path controlRoot;

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AccessSessionIssuer sessions;
    @Autowired DeploymentSettingsRepository settings;
    @Autowired AdminNoticeRepository notices;

    @BeforeAll
    static void generateMaterial() throws Exception {
        Path dir = Files.createTempDirectory("gearvia-tls-material");
        run(dir, "openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                "-out", dir.resolve("privkey.pem").toString());
        run(dir, "openssl", "req", "-x509", "-new", "-key", dir.resolve("privkey.pem").toString(),
                "-days", "60", "-subj", "/CN=gearvia.corp",
                "-addext", "subjectAltName=DNS:gearvia.corp,DNS:localhost",
                "-out", dir.resolve("fullchain.pem").toString());
        certPem = Files.readAllBytes(dir.resolve("fullchain.pem"));
        keyPem = Files.readAllBytes(dir.resolve("privkey.pem"));
        controlRoot = Path.of(System.getProperty("java.io.tmpdir"), "gearvia-tls-api-test");
    }

    private static void run(Path cwd, String... cmd) throws Exception {
        Process process = new ProcessBuilder(cmd).directory(cwd.toFile())
                .redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes());
        if (!process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS) || process.exitValue() != 0) {
            throw new IllegalStateException("command failed: " + String.join(" ", cmd) + "\n" + output);
        }
    }

    private String adminToken() {
        User admin = new User("tls_admin_" + suffix(), "tls-admin-" + suffix() + "@example.com",
                "hash", "TLS Admin", true);
        admin.promoteToAdmin();
        users.save(admin);
        return sessions.issue(admin, ClientMode.WEB, SessionDevice.unknown(), true).response().accessToken();
    }

    private static String suffix() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private MockMultipartFile cert() {
        return new MockMultipartFile("certificate", "fullchain.pem", MediaType.TEXT_PLAIN_VALUE, certPem);
    }

    private MockMultipartFile key() {
        return new MockMultipartFile("privateKey", "privkey.pem", MediaType.TEXT_PLAIN_VALUE, keyPem);
    }

    private long createDraft(String token) throws Exception {
        MvcResult result = mvc.perform(multipart("/api/v1/admin/deployment-settings/drafts")
                        .file(cert()).file(key())
                        .param("publicUrl", "https://gearvia.corp")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.privateKey").doesNotExist())
                .andExpect(jsonPath("$.certificatePem").doesNotExist())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("PRIVATE KEY");
        return ((Number) com.jayway.jsonpath.JsonPath.read(
                result.getResponse().getContentAsString(), "$.jobId")).longValue();
    }

    @Test
    void draftRequiresAdministrator() throws Exception {
        mvc.perform(multipart("/api/v1/admin/deployment-settings/drafts")
                        .file(cert()).file(key()).param("publicUrl", "https://gearvia.corp"))
                .andExpect(status().isForbidden());
    }

    @Test
    void applyRejectsUntestedJob() throws Exception {
        String token = adminToken();
        long jobId = createDraft(token);
        mvc.perform(post("/api/v1/admin/deployment-settings/{id}/apply", jobId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isConflict());
    }

    @Test
    void testThenApplyCompletesAndUpdatesPublicUrl() throws Exception {
        String token = adminToken();
        long jobId = createDraft(token);

        mvc.perform(post("/api/v1/admin/deployment-settings/{id}/test", jobId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TEST_SUCCEEDED"));

        Path results = controlRoot.resolve("results");
        Files.createDirectories(results);
        Files.writeString(results.resolve("tls-" + jobId + ".env"), String.join("\n",
                "requestId=tls-" + jobId,
                "status=APPLIED",
                "code=OK",
                "certificateIssuer=CN=gearvia.corp",
                "certificateNotAfter=Jan  1 00:00:00 2027 GMT",
                "certificateSans=DNS:gearvia.corp,DNS:localhost") + "\n");

        mvc.perform(post("/api/v1/admin/deployment-settings/{id}/apply", jobId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.privateKey").doesNotExist());

        mvc.perform(get("/api/v1/admin/deployment-settings")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicUrl").value("https://gearvia.corp"))
                .andExpect(jsonPath("$.privateKey").doesNotExist());

        assertThat(settings.findById(DeploymentSettings.SINGLETON_ID))
                .get().extracting(DeploymentSettings::getPublicUrl).isEqualTo("https://gearvia.corp");
        assertThat(notices.findAll())
                .anyMatch(notice -> notice.getTitle().contains("gearvia.corp"));
    }

    @Test
    void applyWaitsForAnAsyncHostResultBeforeReturning() throws Exception {
        String token = adminToken();
        long jobId = createDraft(token);

        mvc.perform(post("/api/v1/admin/deployment-settings/{id}/test", jobId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());

        Path results = controlRoot.resolve("results");
        Files.createDirectories(results);
        Path resultFile = results.resolve("tls-" + jobId + ".env");
        Files.deleteIfExists(resultFile);
        Thread writer = new Thread(() -> {
            try {
                Thread.sleep(500);
                Files.writeString(resultFile, String.join("\n",
                        "requestId=tls-" + jobId, "status=APPLIED", "code=OK",
                        "certificateIssuer=CN=gearvia.corp",
                        "certificateNotAfter=Jan  1 00:00:00 2027 GMT",
                        "certificateSans=DNS:gearvia.corp,DNS:localhost") + "\n");
            } catch (Exception ignored) {
                // test thread interruption is not actionable here
            }
        });
        writer.start();

        mvc.perform(post("/api/v1/admin/deployment-settings/{id}/apply", jobId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
        writer.join();
    }
}
