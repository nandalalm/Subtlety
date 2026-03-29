import Admin from "../model/admin.js";

const adminRepository = {
  findOne: async (query) => {
    return await Admin.findOne(query);
  }
};

export default adminRepository;
