using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.SemanticKernel;
using System.ComponentModel;
using Newtonsoft.Json;
using System.Net;
using System.Text.RegularExpressions;
using System.Web;

namespace genai.backend.api.Plugins
{
    public class GooglePlugin
    {
        public bool cacheResponses = true; // Indicates if a cache of all search results should be saved
        public WebClient client = new WebClient();
        public Dictionary<string, (DateTime timestamp, RootResult[] results)> cache = new Dictionary<string, (DateTime, RootResult[])>(); // Cache dictionary containing all results cached

        [KernelFunction("normal_google_web_search")]
        [Description("Search Google web for a specific search query to get results from internet")]
        [return: Description("The result of the search")]
        public async Task<string> Search([Description("Shortened Search Query")] string query, [Description("number of pages required")] int start = 0)
        {
            if (cacheResponses && cache.Count == 0) LoadCache();

            string queryUrl = "https://www.google.com/search?q=" + HttpUtility.UrlEncode(query.ToLower()) + "&start=" + start;
            if (cache.ContainsKey(queryUrl))
            {
                var cacheEntry = cache[queryUrl];
                // Check if the cache entry is older than 5 minutes
                if ((DateTime.UtcNow - cacheEntry.timestamp).TotalMinutes < 5)
                {
                    return JsonConvert.SerializeObject(cacheEntry.results);
                }
            }

            try
            {
                client.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
                string response = client.DownloadString(queryUrl);
                var doc = new HtmlAgilityPack.HtmlDocument();
                doc.LoadHtml(response);
                string headingResult = string.Empty;

                var headingNodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'BNeawe') and contains(@class, 'AP7Wnd')]");
                Regex regex = new Regex(@"\bBNeawe\s+(\S+)\s+AP7Wnd\b");

                if (headingNodes != null)
                {
                    var filteredNodes = headingNodes.Where(node => regex.IsMatch(node.GetAttributeValue("class", ""))).ToList();
                    if (filteredNodes.Count > 0)
                    {
                        headingResult = string.Join(" ", filteredNodes.Select(node => WebUtility.HtmlDecode(node.InnerText)));
                    }
                }

                var searchResults = doc.DocumentNode.SelectNodes("//div[@class='Gx5Zad fP1Qef xpd EtOod pkphOe']"); // Updated node class

                List<Result> results = new List<Result>();

                if (searchResults != null)
                {
                    foreach (var node in searchResults)
                    {
                        var titleNode = node.SelectSingleNode(".//h3");
                        var linkNode = node.SelectSingleNode(".//a");
                        var descNode = node.SelectSingleNode(".//div[@class='BNeawe s3v9rd AP7Wnd']");

                        if (titleNode != null && linkNode != null && descNode != null)
                        {
                            results.Add(new Result()
                            {
                                url = WebUtility.UrlDecode(linkNode.GetAttributeValue("href", string.Empty).Substring(("/url?q=").Length).Split('&')[0]),
                                title = WebUtility.HtmlDecode(titleNode.InnerText),
                                description = WebUtility.HtmlDecode(descNode.InnerText)
                            });
                        }
                    }
                }
                RootResult[] rootResults = new RootResult[] { new RootResult() { headingResult = headingResult, baseResults = results.ToArray() } };

                if (response.Length > 1500 && cacheResponses)
                {
                    cache[queryUrl] = (DateTime.UtcNow, rootResults.ToArray());
                    SaveCache();
                }

                return JsonConvert.SerializeObject(rootResults);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to load Google search results: " + ex.Message);
                return "Failed to load Google search results: " + ex.Message;
            }


        }

        [KernelFunction("advanced_google_web_search")]
        [Description("Advanced Search on Google web for a specific search query with number of page required to get results from internet")]
        [return: Description("The result of the search")]
        public async Task<string> SearchPages([Description("Shortened Search Query")] string query, [Description("number of pages required")] int pages)
        {
            List<object> Results = new List<object>();
            try
            {
                for (int i = 0; i < pages; i++)
                {
                    string searchResult = await Search(query, i);
                    var parsedResult = JsonConvert.DeserializeObject(searchResult);
                    Results.Add(parsedResult);
                }
                string formattedResult = JsonConvert.SerializeObject(Results);
                //Console.WriteLine("Advanced Google web search used");
                return formattedResult;
            }
            catch (Exception ex)
            {
                return "Error occurred: " + ex.Message;
            }
        }

        public void LoadCache()
        {
            if (File.Exists("GoogleSearchCache.json"))
            {
                var tempCache = JsonConvert.DeserializeObject<Dictionary<string, (string timestamp, RootResult[] results)>>(File.ReadAllText("GoogleSearchCache.json"));
                cache = tempCache.ToDictionary(k => k.Key, k => (DateTime.Parse(k.Value.timestamp), k.Value.results));
            }
        }

        public void SaveCache()
        {
            var tempCache = cache.ToDictionary(k => k.Key, k => (k.Value.timestamp.ToString(), k.Value.results));
            File.WriteAllText("GoogleSearchCache.json", JsonConvert.SerializeObject(tempCache));
        }

        public class RootResult
        {
            public string headingResult;
            public Result[] baseResults;
        }
        public class Result
        {
            public string url, title, description;
        }
    }
}
