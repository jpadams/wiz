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
	async scanDirectory(dir: Directory, wizId: Secret, wizSecret: Secret): Promise<Container> {
		const wiz = await this.authd(wizId, wizSecret);
		const path = "/scan";
		return wiz
		  .withDirectory(path, dir)
			.withExec(["wizcli", "dir", "scan", path]);
	}

	/**
	 * Scan a container image in a registry with Wiz CLI
	 */
	@func()
	async scanImage(image: string, wizId: Secret, wizSecret: Secret): Promise<Container> {
		const wiz = await this.authd(wizId, wizSecret);
		return wiz.withExec(["wizcli", "docker", "scan", "--image", image]);
	}

	/**
	 * Scan a Dagger Container with Wiz CLI
	 */
	@func()
	async scanContainer(container: Container, name = "scanned-image", wizId: Secret, wizSecret: Secret): Promise<Container> {
		const tar = container.asTarball();
		const wiz = await this.authd(wizId, wizSecret);
		return wiz
			.withFile(`/scan/${name}.tar`, tar)
			.withWorkdir("/scan")
		  .withServiceBinding("docker", dag.container().from("docker:dind").asService())
			.withEnvVariable("DOCKER_HOST", "tcp://docker:2375")
			.withExec(["bash", "-c", `docker load -t ${name} -i /scan/${name}.tar`])
			.withExec(["bash", "-c", `wizcli docker scan --image ${name}`]);
	}
}