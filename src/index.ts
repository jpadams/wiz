/**
 * A module for Wiz scanning
 */
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

@object()
export class Wiz {
  /**
   * Returns a Container with the latest Wiz CLI 
   */
  @func()
  async base(): Promise<Container> {
    const platform = await dag.defaultPlatform();
		const arch = platform.toString().split("/")[1];
		const url = `https://wizcli.app.wiz.io/latest/wizcli-linux-${arch}`;
    return dag
      .container()
      .from("alpine:latest")
			.withExec(["apk", "add", "curl", "bash", "docker-cli"])
			.withWorkdir("/usr/local/bin")
      .withExec(["curl", "-Lo", "wizcli", url])
			.withExec(["chmod", "+x", "wizcli"]);
  }

	/**
   * Returns a base Container authenticated with Wiz 
   */
  @func()
	async authd(wizId: Secret, wizSecret: Secret): Promise<Container> {
		const base = await this.base();
		return base
		  .withSecretVariable("WIZ_ID", wizId)
			.withSecretVariable("WIZ_SECRET", wizSecret)
		  .withExec(["bash", "-c", "wizcli auth --id $WIZ_ID --secret $WIZ_SECRET"]);
	}

	/**
	 * Scan a directory with Wiz CLI 
	 */
	@func()
	async scanDirectory(dir: Directory, wizId: Secret, wizSecret: Secret): Promise<string> {
		const wiz = await this.authd(wizId, wizSecret);
		const path = "/scan";
		return wiz
		  .withDirectory(path, dir)
			.withExec(["wizcli", "dir", "scan", "--path", path])
			.stdout();
	}

	/**
	 * Scan a Dagger Container with Wiz CLI
	 */
	@func()
	async scanContainer(container: Container, wizId: Secret, wizSecret: Secret): Promise<string> {
		const img = "scanned-image";
		const tar = container.asTarball();
		const wiz = await this.authd(wizId, wizSecret);
		return wiz
			.withFile(`/scan/image.tar`, tar)
			.withWorkdir("/scan")
			.withEnvVariable("DOCKER_HOST", "tcp://docker:2375")
		  .withServiceBinding("docker", dag.docker().engine())
			.withExec(["bash", "-c", "docker load -i /scan/image.tar | awk '{print $4}' > /scan/image-name"])
			.withExec(["bash", "-c", `docker tag $(cat /scan/image-name) ${img}`])
			.withExec(["bash", "-c", `wizcli docker scan --image ${img}`])
			.stdout();
	}
}