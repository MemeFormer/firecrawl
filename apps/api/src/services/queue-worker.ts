import { CustomError } from "../lib/custom-error";
import { getWebScraperQueue } from "./queue-service";
import "dotenv/config";
import { logtail } from "./logtail";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { callWebhook } from "./webhook";

getWebScraperQueue().process(
  Math.floor(Number(process.env.NUM_WORKERS_PER_QUEUE ?? 8)),
  async function (job, done) {
    try {
      job.progress({
        current: 1,
        total: 100,
        current_step: "SCRAPING",
        current_url: "",
      });
      const { success, message, docs } = await startWebScraperPipeline({ job });

      const data = {
        success: success,
        result: {
          links: docs.map((doc) => {
            return { content: doc, source: doc.metadata.sourceURL };
          }),
        },
        project_id: job.data.project_id,
        error: message /* etc... */,
      };

      await callWebhook(job.data.team_id, data);
      done(null, data);
    } catch (error) {
      if (error instanceof CustomError) {
        // Here we handle the error, then save the failed job
        console.error(error.message); // or any other error handling

        logtail.error("Custom error while ingesting", {
          job_id: job.id,
          error: error.message,
          dataIngestionJob: error.dataIngestionJob,
        });
      }
      console.log(error);

      logtail.error("Overall error ingesting", {
        job_id: job.id,
        error: error.message,
      });

      const data = {
        success: false,
        project_id: job.data.project_id,
        error:
          "Something went wrong... Contact help@mendable.ai or try again." /* etc... */,
      };
      await callWebhook(job.data.team_id, data);
      done(null, data);
    }
  }
);
